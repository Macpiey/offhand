import WebSocket from 'ws';
import {
  parseRelayFrame,
  parseClientMessage,
  type RelayFrame,
  type ServerMessage,
} from '@offhand/shared';
import type { SessionCore } from './session-core.js';

const HEARTBEAT_MS = 30_000; // POC risk #3: free-tier WS idle timeouts
const MAX_BACKOFF_MS = 30_000;

/**
 * M2 transport: outbound-only WSS to the relay (never an inbound port —
 * key architecture property). Wraps ServerMessages in `peer` frames and
 * unwraps incoming `peer` frames into ClientMessages. Reconnects forever
 * with exponential backoff; the phone replays via `resume` after gaps.
 */
export class RelayClient {
  private ws: WebSocket | null = null;
  private backoffMs = 500;
  private heartbeat: NodeJS.Timeout | null = null;
  private detach: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly core: SessionCore,
    private readonly relayUrl: string,
    private readonly sessionId: string,
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
        ws.send(JSON.stringify({ kind: 'peer', payload: msg } satisfies RelayFrame));
      }
    };

    ws.on('open', () => {
      this.backoffMs = 500;
      console.log(`relay: connected (${this.relayUrl})`);
      this.detach = this.core.attach(send);
      send(this.core.hello());
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
      if (frame.kind !== 'peer') return; // pong/presence need no action here
      try {
        this.core.handle(parseClientMessage(JSON.stringify(frame.payload)), send);
      } catch {
        // Malformed peer payload is dropped, never fatal.
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
