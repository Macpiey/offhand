import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  parseRelayFrame,
  RelayRoleSchema,
  SESSION_ID_MIN_LENGTH,
  type RelayFrame,
} from '@offhand/shared';
import { z } from 'zod';
import { PushService } from './push.js';

/**
 * offhand relay (M2+M3). A deliberately dumb pipe:
 *  - daemon and phone(s) connect to /ws?session=<id>&role=<daemon|phone>
 *  - `peer` frames are forwarded to the other side, payload UNINSPECTED —
 *    since M3 payloads are secretbox ciphertext, so there is nothing to read
 *  - relay-originated `presence` frames report honest daemon state
 *  - pairing endpoints hold ONLY the phone's PUBLIC key for a short TTL;
 *    the daemon's public key travels inside the pairing code, never here
 *  - logging is metadata-only: session id prefix, roles, sizes, timings
 *
 * No DB: the daemon owns the transcript log and replays on `resume`, so the
 * relay keeps zero message state.
 */

interface Session {
  daemon: WebSocket | null;
  phones: Set<WebSocket>;
  lastDaemonSeenMs: number | null;
}

interface PendingPairing {
  phonePublicKeyB64: string | null;
  expiresAtMs: number;
  /** Token already picked up by the daemon — any further answer is rejected. */
  consumed?: boolean;
}

const PAIRING_TTL_MS = 10 * 60 * 1000;

const PairingAnswerSchema = z.object({
  phonePublicKey: z.string().min(32).max(128),
});

export function buildApp(opts: { logger?: unknown } = {}): FastifyInstance {
  const sessions = new Map<string, Session>();
  const pairings = new Map<string, PendingPairing>();

  const getSession = (id: string): Session => {
    let s = sessions.get(id);
    if (!s) {
      s = { daemon: null, phones: new Set(), lastDaemonSeenMs: null };
      sessions.set(id, s);
    }
    return s;
  };

  const sweepPairings = () => {
    const now = Date.now();
    for (const [token, p] of pairings) if (p.expiresAtMs < now) pairings.delete(token);
  };

  const app = Fastify({ logger: (opts.logger ?? true) as never });
  const push = new PushService();

  // The phone client is served from a different origin (Pages/localhost);
  // pairing endpoints carry only public keys, so open CORS is fine.
  void app.register(cors, { origin: true });

  void app.register(websocket);

  // Opaque binary bodies for artifact uploads.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body),
  );

  app.get('/healthz', async () => ({ ok: true }));

  // ---- web push (M4) ------------------------------------------------------

  app.get('/push/vapid', async () => ({ publicKey: push.publicKey }));

  const SubscribeSchema = z.object({
    session: z.string().min(SESSION_ID_MIN_LENGTH),
    subscription: z.object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    }),
  });

  app.post('/push/subscribe', async (req, reply) => {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad subscription' });
    push.subscribe(parsed.data.session, parsed.data.subscription);
    req.log.info({ session: parsed.data.session.slice(0, 6) }, 'push subscribed');
    return { ok: true };
  });

  const VerdictSchema = z.object({
    session: z.string().min(SESSION_ID_MIN_LENGTH),
    approvalId: z.string().min(8),
    approve: z.boolean(),
  });

  // Notification action buttons post here (opaque ids only — safe per
  // architecture doc); relay forwards the verdict to the session's daemon.
  app.post('/push/verdict', async (req, reply) => {
    const parsed = VerdictSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad verdict' });
    const session = sessions.get(parsed.data.session);
    if (!session?.daemon) return reply.code(404).send({ error: 'daemon offline' });
    const frame: RelayFrame = {
      kind: 'verdict',
      approvalId: parsed.data.approvalId,
      approve: parsed.data.approve,
    };
    safeSend(session.daemon, JSON.stringify(frame));
    req.log.info(
      { session: parsed.data.session.slice(0, 6), approve: parsed.data.approve },
      'push verdict forwarded',
    );
    return { ok: true };
  });

  const DropPushSchema = z.object({
    session: z.string().min(SESSION_ID_MIN_LENGTH),
  });

  app.post('/push/drop', async (req, reply) => {
    const parsed = DropPushSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad drop push' });
    const sent = await push.notifyDrop(parsed.data.session);
    req.log.info({ session: parsed.data.session.slice(0, 6), sent }, 'drop push notify');
    return { ok: true, sent };
  });

  // ---- pairing (M3) -------------------------------------------------------
  // Phone answers a pairing token with its PUBLIC key; daemon polls for it.
  // The relay learns only the public key — useless without the secret keys
  // that never leave the endpoints.

  app.post('/pair/:token/answer', async (req, reply) => {
    sweepPairings();
    const token = (req.params as { token: string }).token;
    const parsed = PairingAnswerSchema.safeParse(req.body);
    if (!parsed.success || token.length < 6 || token.length > 64) {
      return reply.code(400).send({ error: 'bad pairing answer' });
    }
    const existing = pairings.get(token);
    if (existing?.consumed) {
      // Daemon already picked up an answer — a second answer is a replay or
      // an interception attempt. Refuse loudly.
      return reply.code(410).send({ error: 'pairing code already used — generate a new one' });
    }
    if (existing?.phonePublicKeyB64) {
      // First answer wins; a second answer is either a retry or an attacker —
      // reject and let the humans compare fingerprints.
      return reply.code(409).send({ error: 'already answered' });
    }
    pairings.set(token, {
      phonePublicKeyB64: parsed.data.phonePublicKey,
      expiresAtMs: Date.now() + PAIRING_TTL_MS,
    });
    req.log.info({ token: token.slice(0, 4) }, 'pairing answered');
    return { ok: true };
  });

  app.get('/pair/:token/answer', async (req, reply) => {
    sweepPairings();
    const token = (req.params as { token: string }).token;
    const p = pairings.get(token);
    if (!p?.phonePublicKeyB64) return reply.code(404).send({ error: 'no answer yet' });
    // One-shot pickup; keep a consumed tombstone so token reuse fails loudly.
    const key = p.phonePublicKeyB64;
    pairings.set(token, { phonePublicKeyB64: null, consumed: true, expiresAtMs: p.expiresAtMs });
    return { phonePublicKey: key };
  });

  // ---- encrypted artifact blobs (M5) --------------------------------------
  // POC simplification (logged in decision log): the relay itself holds the
  // opaque ciphertext blobs instead of R2. Same security property — the relay
  // cannot decrypt them — R2 arrives when multi-user scale demands it.

  const MAX_BLOB_BYTES = 8 * 1024 * 1024;
  const MAX_BLOBS_PER_SESSION = 20;
  const BLOB_TTL_MS = 60 * 60 * 1000;
  interface Blob_ {
    data: Buffer;
    contentHint: string;
    expiresAtMs: number;
  }
  const blobs = new Map<string, Map<string, Blob_>>(); // session → id → blob

  const sweepBlobs = () => {
    const now = Date.now();
    for (const [sid, m] of blobs) {
      for (const [id, b] of m) if (b.expiresAtMs < now) m.delete(id);
      if (m.size === 0) blobs.delete(sid);
    }
  };

  app.post('/artifacts/:session', {
    // Raw opaque bytes; never parsed, never logged beyond size.
    config: {},
    bodyLimit: MAX_BLOB_BYTES,
  }, async (req, reply) => {
    sweepBlobs();
    const sessionId = (req.params as { session: string }).session;
    if (sessionId.length < SESSION_ID_MIN_LENGTH) return reply.code(400).send({ error: 'bad session' });
    const data = req.body as Buffer;
    if (!Buffer.isBuffer(data) || data.length === 0) return reply.code(400).send({ error: 'empty blob' });
    let m = blobs.get(sessionId);
    if (!m) {
      m = new Map();
      blobs.set(sessionId, m);
    }
    if (m.size >= MAX_BLOBS_PER_SESSION) {
      const oldest = m.keys().next().value as string | undefined;
      if (oldest) m.delete(oldest);
    }
    const id = randomUUID();
    m.set(id, {
      data,
      contentHint: String(req.headers['x-content-hint'] ?? 'application/octet-stream'),
      expiresAtMs: Date.now() + BLOB_TTL_MS,
    });
    req.log.info({ session: sessionId.slice(0, 6), bytes: data.length }, 'artifact stored');
    return { blobId: id };
  });

  app.get('/artifacts/:session/:id', async (req, reply) => {
    sweepBlobs();
    const { session: sessionId, id } = req.params as { session: string; id: string };
    const blob = blobs.get(sessionId)?.get(id);
    if (!blob) return reply.code(404).send({ error: 'no such artifact' });
    return reply.header('content-type', 'application/octet-stream').send(blob.data);
  });

  // ---- session websocket --------------------------------------------------

  void app.register(async (f) => {
    f.get('/ws', { websocket: true }, (socket, req) => {
      const q = req.query as Record<string, string | undefined>;
      const sessionId = q.session ?? '';
      const roleParse = RelayRoleSchema.safeParse(q.role);
      if (sessionId.length < SESSION_ID_MIN_LENGTH || !roleParse.success) {
        socket.close(4400, 'bad session or role');
        return;
      }
      const role = roleParse.data;
      const session = getSession(sessionId);
      const sidLog = sessionId.slice(0, 6);

      if (role === 'daemon') {
        // Newest daemon wins (laptop restarted); the old socket is dropped.
        session.daemon?.close(4409, 'replaced by new daemon connection');
        session.daemon = socket;
        session.lastDaemonSeenMs = Date.now();
        broadcastPresence(session);
      } else {
        session.phones.add(socket);
        sendPresence(socket, session);
      }
      f.log.info({ session: sidLog, role }, 'connected');

      socket.on('message', (raw: Buffer | string) => {
        const text = raw.toString();
        let frame: RelayFrame;
        try {
          frame = parseRelayFrame(text);
        } catch {
          return; // malformed input is dropped, never fatal
        }
        if (role === 'daemon') session.lastDaemonSeenMs = Date.now();

        switch (frame.kind) {
          case 'ping':
            socket.send(JSON.stringify({ kind: 'pong' } satisfies RelayFrame));
            return;
          case 'notify': {
            // Daemon asks for a push; only opaque ids ever reach Apple/Google.
            if (role !== 'daemon') return;
            if (frame.notice === 'approval') {
              if (!frame.id) return;
              void push.notifyApproval(sessionId, frame.id).then((sent) => {
                f.log.info({ session: sidLog, sent }, 'push notify');
              });
            } else {
              void push.notifyDrop(sessionId).then((sent) => {
                f.log.info({ session: sidLog, sent }, 'drop push notify');
              });
            }
            return;
          }
          case 'peer': {
            // Forward verbatim, payload uninspected. Metadata-only log.
            f.log.info({ session: sidLog, from: role, bytes: text.length }, 'forward');
            if (role === 'daemon') {
              for (const phone of session.phones) safeSend(phone, text);
            } else {
              if (session.daemon) safeSend(session.daemon, text);
            }
            return;
          }
          default:
            return; // presence/pong are relay-originated; ignore from clients
        }
      });

      socket.on('close', () => {
        f.log.info({ session: sidLog, role }, 'disconnected');
        if (role === 'daemon') {
          if (session.daemon === socket) {
            session.daemon = null;
            session.lastDaemonSeenMs = Date.now();
            broadcastPresence(session);
          }
        } else {
          session.phones.delete(socket);
        }
        if (!session.daemon && session.phones.size === 0) sessions.delete(sessionId);
      });
    });
  });

  return app;
}

function sendPresence(to: WebSocket, session: Session): void {
  const frame: RelayFrame = {
    kind: 'presence',
    daemonOnline: session.daemon !== null,
    ...(session.lastDaemonSeenMs !== null ? { lastSeenMs: session.lastDaemonSeenMs } : {}),
  };
  safeSend(to, JSON.stringify(frame));
}

function broadcastPresence(session: Session): void {
  for (const phone of session.phones) sendPresence(phone, session);
}

function safeSend(ws: WebSocket, text: string): void {
  if (ws.readyState === ws.OPEN) ws.send(text);
}
