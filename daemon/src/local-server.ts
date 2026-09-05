import { WebSocketServer, WebSocket } from 'ws';
import { parseClientMessage, type ServerMessage } from '@offhand/shared';
import type { SessionCore } from './session-core.js';

/** M1 localhost transport: bare WS straight to the browser page. */
export class LocalSessionServer {
  private wss: WebSocketServer;

  constructor(
    private readonly core: SessionCore,
    port: number,
  ) {
    this.wss = new WebSocketServer({ port, host: '127.0.0.1' });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  private onConnection(ws: WebSocket): void {
    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const detach = this.core.attach(send);
    send(this.core.hello());

    ws.on('message', (raw) => {
      try {
        this.core.handle(parseClientMessage(raw.toString()), send);
      } catch {
        // Malformed client input is dropped, never fatal.
      }
    });
    ws.on('close', detach);
  }
}
