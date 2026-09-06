import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunEvent, ApprovalPolicy } from '@offhand/shared';

export interface Verdict {
  approve: boolean;
  message?: string;
}

/**
 * Pending-approval registry (M4, policy-aware since W3). The claude
 * permission hook submits a request; depending on the workspace policy the
 * broker either auto-approves low-risk actions (trusting) or emits an
 * `approval` RunEvent to the phone and waits for the verdict / timeout.
 */
export class ApprovalBroker {
  private pending = new Map<string, { settle: (v: Verdict) => void; timer: NodeJS.Timeout }>();
  private listener: ((ev: RunEvent) => void) | null = null;

  /** Injected by the session manager: policy of the workspace whose run is
   * currently asking. Defaults to balanced when ambiguous. */
  policyProvider: () => ApprovalPolicy = () => 'balanced';

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
    const risk = classifyRisk(toolName, input);
    // Reading a file the USER just attached from their phone needs no
    // permission — they sent it to be read.
    const filePath = (input as Record<string, unknown> | null)?.file_path;
    if (
      toolName === 'Read' &&
      typeof filePath === 'string' &&
      filePath.toLowerCase().startsWith(join(tmpdir(), 'offhand-attachments').toLowerCase())
    ) {
      return Promise.resolve({ approve: true });
    }
    // AskUserQuestion is literally a question for the human — never auto-answer.
    if (this.policyProvider() === 'trusting' && risk === 'low' && toolName !== 'AskUserQuestion') {
      // Trusting workspaces: low-risk actions sail through; high-risk still asks.
      this.listener({
        type: 'tool',
        name: 'auto-approved',
        summary: `auto-approved (trusting): ${toolName} — ${summariseInput(input)}`,
      });
      return Promise.resolve({ approve: true });
    }
    const id = randomUUID();
    const preview = buildPreview(toolName, input);
    const question = typeof input === 'object' && input !== null ? firstQuestion(input as Record<string, unknown>) : undefined;
    const event: RunEvent = {
      type: 'approval',
      id,
      action: toolName,
      detail: summariseInput(input),
      risk,
      ...(preview ? { preview } : {}),
      ...(question ? { question } : {}),
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

  /** Phone verdict arrives (via RunHandle.respond). When `answer` is present
   * the user picked an option for an agent question: the MCP tool call is
   * denied, but the deny MESSAGE carries the answer — the agent reads it and
   * continues with the user's choice (the closest thing to answering that the
   * permission-prompt protocol allows). */
  resolve(approvalId: string, approve: boolean, answer?: string): boolean {
    const p = this.pending.get(approvalId);
    if (!p) return false;
    this.pending.delete(approvalId);
    clearTimeout(p.timer);
    if (answer !== undefined) {
      p.settle({
        approve: false,
        message: `The user answered your question directly from their phone: "${answer}". This IS their answer — proceed with it and do not ask again.`,
      });
      this.listener?.({ type: 'approval-result', id: approvalId, approve: true, answer });
      return true;
    }
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
  const q = firstQuestion(i);
  if (q) return truncate(q.text, 200);
  for (const key of ['command', 'file_path', 'path', 'url', 'pattern', 'description']) {
    if (typeof i[key] === 'string' && i[key] !== '') return truncate(`${key}: ${i[key] as string}`, 200);
  }
  return truncate(JSON.stringify(input), 200);
}

interface AskQuestion {
  text: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
}

/** Extract the first question from AskUserQuestion-style input, if present. */
function firstQuestion(i: Record<string, unknown>): AskQuestion | undefined {
  if (!Array.isArray(i.questions) || i.questions.length === 0) return undefined;
  const q = i.questions[0] as Record<string, unknown>;
  if (typeof q?.question !== 'string') return undefined;
  const options = Array.isArray(q.options)
    ? (q.options as Record<string, unknown>[])
        .filter((o) => typeof o?.label === 'string')
        .map((o) => ({
          label: o.label as string,
          ...(typeof o.description === 'string' ? { description: o.description } : {}),
        }))
    : [];
  return { text: q.question, options, ...(q.multiSelect === true ? { multiSelect: true } : {}) };
}

/** Content preview for the approval sheet: what will actually change/run. */
export function buildPreview(toolName: string, input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const i = input as Record<string, unknown>;
  const q = firstQuestion(i);
  if (q) {
    const lines = [q.text, ...q.options.map((o, n) => `${n + 1}. ${o.label}${o.description ? ` — ${o.description}` : ''}`)];
    return truncate(lines.join('\n'), 600);
  }
  if (/^(Edit|MultiEdit)/.test(toolName) && typeof i.new_string === 'string') {
    const oldS = typeof i.old_string === 'string' ? i.old_string : '';
    const lines = [
      ...oldS.split('\n').map((l) => `- ${l}`),
      ...(i.new_string as string).split('\n').map((l) => `+ ${l}`),
    ];
    return truncate(lines.join('\n'), 600);
  }
  if (/^Write/.test(toolName) && typeof i.content === 'string') {
    return truncate((i.content as string).split('\n').map((l) => `+ ${l}`).join('\n'), 600);
  }
  if (typeof i.command === 'string') return truncate(`$ ${i.command as string}`, 600);
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
