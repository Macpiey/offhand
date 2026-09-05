import { randomUUID } from 'node:crypto';
import type { ClientMessage, RunEvent, ServerMessage } from '@offhand/shared';
import type { AgentRunner, RunHandle } from './runner.js';

export type Sink = (msg: ServerMessage) => void;

/**
 * Transport-agnostic session brain. Owns the runner, the active run, and the
 * seq-numbered replay log (the daemon is the source of truth for transcripts;
 * the relay stores nothing). Local WS server (M1) and relay client (M2) are
 * thin transports over this.
 */
export class SessionCore {
  private log: ServerMessage[] = [];
  private seq = 0;
  private activeRun: RunHandle | null = null;
  private sinks = new Set<Sink>();

  constructor(
    private readonly runner: AgentRunner,
    readonly workspace: string,
    readonly runnerAvailable: boolean,
  ) {}

  attach(sink: Sink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  hello(): ServerMessage {
    return {
      type: 'hello',
      workspace: this.workspace,
      runner: this.runner.id,
      runnerAvailable: this.runnerAvailable,
      lastSeq: this.seq,
    };
  }

  /** Handle one client message; `reply` targets just the sender (resume). */
  handle(msg: ClientMessage, reply: Sink): void {
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
          if ('seq' in m && m.seq > msg.afterSeq) reply(m);
        }
        break;
    }
  }

  private startRun(prompt: string): void {
    if (this.activeRun) {
      this.broadcastEvent('', {
        type: 'error',
        message: 'A run is already active — cancel it or wait (one at a time for now).',
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

  /** Append to the replay log and fan out to every attached transport. */
  private record(msg: ServerMessage): void {
    this.log.push(msg);
    for (const sink of this.sinks) sink(msg);
  }
}
