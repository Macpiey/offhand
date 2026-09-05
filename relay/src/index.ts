import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import {
  parseRelayFrame,
  RelayRoleSchema,
  SESSION_ID_MIN_LENGTH,
  type RelayFrame,
} from '@offhand/shared';

/**
 * offhand relay (M2). A deliberately dumb pipe:
 *  - daemon and phone(s) connect to /ws?session=<id>&role=<daemon|phone>
 *  - `peer` frames are forwarded to the other side, payload UNINSPECTED
 *    (M3 makes payloads ciphertext; this code must already not care)
 *  - relay-originated `presence` frames report honest daemon state
 *  - logging is metadata-only: session id prefix, roles, sizes, timings
 *
 * No Postgres yet: the daemon owns the transcript log and replays on
 * `resume`, so the relay keeps zero message state. DB arrives with pairing
 * records in M3 (data model in 02-architecture.md).
 */

interface Session {
  daemon: WebSocket | null;
  phones: Set<WebSocket>;
  lastDaemonSeenMs: number | null;
}

const sessions = new Map<string, Session>();

const getSession = (id: string): Session => {
  let s = sessions.get(id);
  if (!s) {
    s = { daemon: null, phones: new Set(), lastDaemonSeenMs: null };
    sessions.set(id, s);
  }
  return s;
};

const app = Fastify({ logger: true });
await app.register(websocket);

app.get('/healthz', async () => ({ ok: true }));

app.register(async (f) => {
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

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: '0.0.0.0' });
