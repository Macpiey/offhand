import { randomUUID } from 'node:crypto';
import type { RunEvent } from '@offhand/shared';

export interface Verdict {
  approve: boolean;
  message?: string;
}

/**
 * Pending-approval registry (M4). The claude permission hook submits a
 * request; the broker emits an `approval` RunEvent into the active run's
 * stream (→ encrypted → phone) and holds the request open until the phone
 * answers or the timeout auto-denies (02-architecture.md: "unanswered
 * approvals auto-deny after N minutes; run pauses safely rather than dying").
 */
export class ApprovalBroker {
  private pending = new Map<string, { settle: (v: Verdict) => void; timer: NodeJS.Timeout }>();
  private listener: ((ev: RunEvent) => void) | null = null;

  constructor(private readonly timeoutMs: number) {}

  /** The active run attaches to receive approval events; returns detach. */
  attach(listener: (ev: RunEvent) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  /** Called by the local HTTP endpoint on behalf of the MCP prompt tool. */
  submit(toolName: string, input: unknown): Promise<Verdict> {
    if (!this.listener) {
      return Promise.resolve({ approve: false, message: 'no active session to ask' });
    }
    const id = randomUUID();
    const event: RunEvent = {
      type: 'approval',
      id,
      action: toolName,
      detail: summariseInput(input),
      risk: classifyRisk(toolName, input),
    };
    return new Promise<Verdict>((settle) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        settle({ approve: false, message: `auto-denied after ${Math.round(this.timeoutMs / 1000)}s timeout` });
        this.listener?.({ type: 'approval-result', id, approve: false });
      }, this.timeoutMs);
      this.pending.set(id, { settle, timer });
      this.listener!(event);
    });
  }

  /** Phone verdict arrives (via RunHandle.respond). */
  resolve(approvalId: string, approve: boolean): boolean {
    const p = this.pending.get(approvalId);
    if (!p) return false;
    this.pending.delete(approvalId);
    clearTimeout(p.timer);
    p.settle({ approve, message: approve ? undefined : 'denied from phone' });
    // Echo the verdict into the transcript so replays resolve the card.
    this.listener?.({ type: 'approval-result', id: approvalId, approve });
    return true;
  }
}

/** Risky-verb heuristics (02-architecture.md security posture). */
export function classifyRisk(toolName: string, input: unknown): 'low' | 'high' {
  const i = (input ?? {}) as Record<string, unknown>;
  const text = [toolName, i.command, i.file_path, i.path]
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
  return /\b(rm|del|rmdir|rd|format|mkfs|shutdown|reboot|kill|drop\s+table|truncate|git\s+push\s+--force|--hard)\b/i.test(
    text,
  )
    ? 'high'
    : 'low';
}

export function summariseInput(input: unknown): string {
  if (typeof input !== 'object' || input === null) return String(input ?? '');
  const i = input as Record<string, unknown>;
  for (const key of ['command', 'file_path', 'path', 'url', 'pattern', 'description']) {
    if (typeof i[key] === 'string' && i[key] !== '') return truncate(`${key}: ${i[key] as string}`, 200);
  }
  return truncate(JSON.stringify(input), 200);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
