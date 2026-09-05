import type { RunEvent } from '@offhand/shared';

/**
 * Maps one parsed line of `copilot -p --output-format json --stream on`
 * (JSONL) into normalised RunEvents. Verified against Copilot CLI 1.0.31.
 *
 * Shapes handled:
 *  - assistant.message_delta → text chunks
 *  - tool.* / *.tool_call events → tool summaries (best-effort field probing)
 *  - result → done (exitCode 0) | error; carries sessionId for --resume
 * session.*, user.message, reasoning deltas → ignored.
 */
export function mapCopilotEvent(value: unknown): RunEvent[] {
  if (typeof value !== 'object' || value === null) return [];
  const v = value as Record<string, unknown>;
  const type = typeof v.type === 'string' ? v.type : '';
  const data = (v.data ?? {}) as Record<string, unknown>;

  if (type === 'assistant.message_delta') {
    const chunk = data.deltaContent;
    return typeof chunk === 'string' && chunk !== '' ? [{ type: 'text', chunk }] : [];
  }

  if (type.startsWith('tool.') || type.endsWith('.tool_call')) {
    const name = firstString(data, 'toolName', 'name', 'tool') ?? 'tool';
    const summary =
      firstString(data, 'command', 'path', 'file', 'summary', 'description', 'query') ?? '';
    // Only announce starts; end/progress events would duplicate the line.
    if (/(_end|_result|_output)$/.test(type)) return [];
    return [{ type: 'tool', name, summary: summary ? `${name}: ${truncate(summary, 120)}` : name }];
  }

  if (type === 'result') {
    const exitCode = typeof v.exitCode === 'number' ? v.exitCode : Number(v.exitCode ?? 1);
    if (exitCode === 0) return [{ type: 'done', summary: '' }];
    return [{ type: 'error', message: `copilot exited with code ${exitCode}` }];
  }

  return [];
}

/** The `result` line's sessionId enables --resume continuity. */
export function extractCopilotSessionId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  return v.type === 'result' && typeof v.sessionId === 'string' && v.sessionId !== ''
    ? v.sessionId
    : null;
}

function firstString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const val = obj[k];
    if (typeof val === 'string' && val !== '') return val;
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
