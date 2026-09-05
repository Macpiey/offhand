import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { parseClientMessage, type ServerMessage } from '@offhand/shared';
import type { SessionCore } from './session-core.js';
import type { ApprovalBroker } from './approvals.js';

/**
 * Daemon-local server: one 127.0.0.1 port carrying
 *  - WS: the M1 localhost transport for the browser page
 *  - POST /approval: the claude MCP prompt tool submits permission requests
 *    here and long-polls the verdict (M4). Localhost-only by construction.
 */
export class LocalSessionServer {
  private wss: WebSocketServer;

  constructor(
    private readonly core: SessionCore,
    port: number,
    private readonly broker?: ApprovalBroker,
  ) {
    const http = createServer((req, res) => void this.onRequest(req, res));
    this.wss = new WebSocketServer({ server: http });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    http.listen(port, '127.0.0.1');
  }

  private async onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'POST' && req.url === '/approval' && this.broker) {
      try {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          toolName?: string;
          input?: unknown;
        };
        // Long-poll: resolves when the phone answers or the timeout denies.
        const verdict = await this.broker.submit(String(body.toolName ?? 'unknown'), body.input);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(verdict));
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ approve: false, message: `bad approval request: ${String(e)}` }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
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
