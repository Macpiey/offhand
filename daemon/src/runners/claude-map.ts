import type { RunEvent } from '@offhand/shared';

/**
 * Maps one parsed line of `claude -p --output-format stream-json` output into
 * zero or more normalised RunEvents.
 *
 * Pure function, fixture-tested. Claude Code's stream format churns (POC risk
 * #1) — every shape assumption lives HERE and nowhere else. Unknown event
 * types are ignored, never fatal. Verified against CLI v2.1.261.
 *
 * Shapes handled:
 *  - { type: 'system', subtype: 'init', ... }            → ignored
 *  - { type: 'stream_event', event: content_block_delta } → text chunks
 *    (requires --include-partial-messages)
 *  - { type: 'assistant', message: { content: [...] } }   → tool_use blocks
 *    (text blocks are skipped: already streamed as deltas)
 *  - { type: 'result', ... }                              → done | error
 */
export function mapClaudeEvent(value: unknown): RunEvent[] {
  if (typeof value !== 'object' || value === null) return [];
  const v = value as Record<string, unknown>;

  switch (v.type) {
    case 'stream_event': {
      const ev = v.event as Record<string, unknown> | undefined;
      if (ev?.type !== 'content_block_delta') return [];
      const delta = ev.delta as Record<string, unknown> | undefined;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text !== '') {
        return [{ type: 'text', chunk: delta.text }];
      }
      return [];
    }

    case 'assistant': {
      const message = v.message as Record<string, unknown> | undefined;
      const content = Array.isArray(message?.content) ? message.content : [];
      const events: RunEvent[] = [];
      for (const block of content as Record<string, unknown>[]) {
        if (block?.type === 'tool_use' && typeof block.name === 'string') {
          // The offhand approval prompt tool is plumbing, not user-visible work;
          // the approval event itself renders separately.
          if (block.name.startsWith('mcp__offhand__')) continue;
          events.push({
            type: 'tool',
            name: block.name,
            summary: summariseToolInput(block.name, block.input),
          });
        }
      }
      return events;
    }

    case 'result': {
      const isError = v.is_error === true;
      const text = typeof v.result === 'string' ? v.result : '';
      if (isError) {
        return [{ type: 'error', message: text || `run failed (${String(v.subtype ?? 'unknown')})` }];
      }
      const events: RunEvent[] = [{ type: 'done', summary: text }];
      const usage = contextUsage(v.usage);
      if (usage) events.push(usage);
      return events;
    }

    default:
      return [];
  }
}

/** Context accounting from claude's result usage block. The live context is
 * roughly input + cache-read + cache-created + output of the LAST turn. */
function contextUsage(usage: unknown): RunEvent | null {
  if (typeof usage !== 'object' || usage === null) return null;
  const u = usage as Record<string, unknown>;
  const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0);
  const contextTokens =
    n('input_tokens') + n('cache_read_input_tokens') + n('cache_creation_input_tokens') + n('output_tokens');
  if (contextTokens <= 0) return null;
  return { type: 'usage', contextTokens, contextWindow: 200_000 };
}

/** One human-readable line about what a tool call is doing. */
function summariseToolInput(name: string, input: unknown): string {
  if (typeof input !== 'object' || input === null) return name;
  const i = input as Record<string, unknown>;
  const firstString = (...keys: string[]): string | undefined => {
    for (const k of keys) if (typeof i[k] === 'string' && i[k] !== '') return i[k] as string;
    return undefined;
  };
  const hint =
    firstString('file_path', 'path', 'command', 'pattern', 'query', 'url', 'description') ?? '';
  return hint ? `${name}: ${truncate(hint, 120)}` : name;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
