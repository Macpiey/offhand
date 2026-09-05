import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import {
  parseRelayFrame,
  RelayRoleSchema,
  SESSION_ID_MIN_LENGTH,
  type RelayFrame,
} from '@offhand/shared';
import { z } from 'zod';

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

  // The phone client is served from a different origin (Pages/localhost);
  // pairing endpoints carry only public keys, so open CORS is fine.
  void app.register(cors, { origin: true });

  void app.register(websocket);

  app.get('/healthz', async () => ({ ok: true }));

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
    pairings.delete(token); // one-shot pickup
    return { phonePublicKey: p.phonePublicKeyB64 };
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
