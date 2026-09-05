import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import {
  parseClientMessage,
  type ServerMessage,
  type RunEvent,
} from '@offhand/shared';
import type { AgentRunner, RunHandle } from './runner.js';

/**
 * M1 localhost session server. No crypto (M3), no relay (M2). Keeps a
 * seq-numbered log of everything sent so a reconnecting client can `resume`
 * with no gaps — the same replay contract the relay will honour in M2.
 */
export class LocalSessionServer {
  private wss: WebSocketServer;
  private log: ServerMessage[] = [];
  private seq = 0;
  private activeRun: RunHandle | null = null;
  private runnerAvailable = false;

  constructor(
    private readonly runner: AgentRunner,
    private readonly workspace: string,
    port: number,
  ) {
    this.wss = new WebSocketServer({ port, host: '127.0.0.1' });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    void this.runner.detect().then((ok) => (this.runnerAvailable = ok));
  }

  private onConnection(ws: WebSocket): void {
    this.send(ws, {
      type: 'hello',
      workspace: this.workspace,
      runner: this.runner.id,
      runnerAvailable: this.runnerAvailable,
      lastSeq: this.seq,
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = parseClientMessage(raw.toString());
      } catch {
        return; // Malformed client input is dropped, never fatal.
      }
      switch (msg.type) {
        case 'prompt':
          this.startRun(msg.prompt);
          break;
        case 'cancel':
          this.activeRun?.cancel();
          break;
        case 'approval-response':
          this.activeRun?.respond(msg.approvalId, msg.approve);
          break;
        case 'resume':
          for (const m of this.log) {
            if ('seq' in m && m.seq > msg.afterSeq) this.send(ws, m);
          }
          break;
      }
    });
  }

  private startRun(prompt: string): void {
    if (this.activeRun) {
      this.broadcastEvent('', {
        type: 'error',
        message: 'A run is already active — cancel it or wait (M1 allows one at a time).',
      });
      return;
    }
    const runId = randomUUID();
    const handle = this.runner.start({ runId, prompt, workspace: this.workspace });
    this.activeRun = handle;
    this.record({ type: 'run-started', runId, seq: ++this.seq });

    void (async () => {
      try {
        for await (const event of handle.events) {
          this.broadcastEvent(runId, event);
        }
      } finally {
        this.activeRun = null;
      }
    })();
  }

  private broadcastEvent(runId: string, event: RunEvent): void {
    this.record({ type: 'run-event', runId, seq: ++this.seq, event });
  }

  /** Append to the replay log and fan out to every connected client. */
  private record(msg: ServerMessage): void {
    this.log.push(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) this.send(client, msg);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    ws.send(JSON.stringify(msg));
  }
}
