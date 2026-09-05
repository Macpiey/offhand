import WebSocket from 'ws';
import {
  parseRelayFrame,
  parseClientMessage,
  seal,
  open,
  EnvelopeSchema,
  type RelayFrame,
  type ServerMessage,
  type SessionKeys,
} from '@offhand/shared';
import type { SessionManager } from './session-manager.js';

const HEARTBEAT_MS = 30_000; // free-tier WS idle timeouts
const MAX_BACKOFF_MS = 30_000;

/**
 * Relay transport: outbound-only WSS (never an inbound port). Every peer
 * payload is an E2E-encrypted envelope. Approval events additionally trigger
 * a content-free push nudge. Reconnects forever with exponential backoff.
 */
export class RelayClient {
  private ws: WebSocket | null = null;
  private backoffMs = 500;
  private heartbeat: NodeJS.Timeout | null = null;
  private detach: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly manager: SessionManager,
    private readonly relayUrl: string,
    private readonly sessionId: string,
    private readonly keys: SessionKeys,
  ) {}

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.cleanup();
    this.ws?.close();
  }

  private url(): string {
    const base = this.relayUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    return `${base}/ws?session=${encodeURIComponent(this.sessionId)}&role=daemon`;
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.url());
    this.ws = ws;

    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        const envelope = seal(msg, this.keys.tx);
        ws.send(JSON.stringify({ kind: 'peer', payload: envelope } satisfies RelayFrame));
        // Approvals also trigger a content-free push nudge (opaque id only).
        if (msg.type === 'run-event' && msg.event.type === 'approval') {
          ws.send(
            JSON.stringify({
              kind: 'notify',
              notice: 'approval',
              id: msg.event.id,
            } satisfies RelayFrame),
          );
        }
      }
    };

    ws.on('open', () => {
      this.backoffMs = 500;
      console.log(`relay: connected (${this.relayUrl})`);
      this.detach = this.manager.attach(send);
      send(this.manager.hello());
      void this.manager.manifest().then(send);
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ kind: 'ping' } satisfies RelayFrame));
        }
      }, HEARTBEAT_MS);
    });

    ws.on('message', (raw) => {
      let frame;
      try {
        frame = parseRelayFrame(raw.toString());
      } catch {
        return;
      }
      if (frame.kind === 'verdict') {
        // Verdict from a push-notification action button (opaque ids).
        this.manager.handle(
          { type: 'approval-response', approvalId: frame.approvalId, approve: frame.approve },
          send,
        );
        return;
      }
      if (frame.kind !== 'peer') return; // pong/presence need no action here
      try {
        const envelope = EnvelopeSchema.parse(frame.payload);
        const decrypted = open(envelope, this.keys.rx);
        this.manager.handle(parseClientMessage(JSON.stringify(decrypted)), send);
      } catch {
        // Undecryptable or malformed peer payload is dropped, never fatal —
        // wrong-key traffic (stale phone, attacker) simply goes nowhere.
      }
    });

    ws.on('error', (err) => {
      console.error(`relay: ${err.message}`);
    });

    ws.on('close', () => {
      this.cleanup();
      if (this.stopped) return;
      console.log(`relay: disconnected — retrying in ${this.backoffMs}ms`);
      setTimeout(() => this.connect(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    });
  }

  private cleanup(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.detach?.();
    this.detach = null;
  }
}
