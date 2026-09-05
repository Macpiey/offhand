import { describe, it, expect } from 'vitest';
import { mapCopilotEvent, extractCopilotSessionId } from '../src/runners/copilot-map.js';

// Fixtures sampled from real Copilot CLI 1.0.31 JSONL output (2026-09-05).
describe('mapCopilotEvent', () => {
  it('ignores session noise and user echo', () => {
    for (const type of [
      'session.warning',
      'session.mcp_servers_loaded',
      'session.skills_loaded',
      'session.tools_updated',
      'user.message',
      'assistant.turn_start',
      'assistant.turn_end',
      'assistant.reasoning_delta',
      'assistant.reasoning',
      'assistant.message',
    ]) {
      expect(mapCopilotEvent({ type, data: { deltaContent: 'x', content: 'y' } })).toEqual([]);
    }
  });

  it('maps message deltas to text', () => {
    expect(
      mapCopilotEvent({ type: 'assistant.message_delta', data: { messageId: 'm1', deltaContent: 'pong' } }),
    ).toEqual([{ type: 'text', chunk: 'pong' }]);
  });

  it('maps tool starts and skips tool ends', () => {
    expect(
      mapCopilotEvent({ type: 'tool.execution_start', data: { toolName: 'str_replace_editor', path: 'index.html' } }),
    ).toEqual([{ type: 'tool', name: 'str_replace_editor', summary: 'str_replace_editor: index.html' }]);
    expect(mapCopilotEvent({ type: 'tool.execution_end', data: { toolName: 'bash' } })).toEqual([]);
  });

  it('maps result to done/error and yields sessionId', () => {
    const ok = { type: 'result', sessionId: '27ee8243', exitCode: 0, usage: {} };
    expect(mapCopilotEvent(ok)).toEqual([{ type: 'done', summary: '' }]);
    expect(extractCopilotSessionId(ok)).toBe('27ee8243');
    expect(mapCopilotEvent({ type: 'result', exitCode: 3 })).toEqual([
      { type: 'error', message: 'copilot exited with code 3' },
    ]);
  });

  it('never throws on garbage', () => {
    for (const garbage of [null, 1, 'x', [], {}, { type: 'result' }, { type: 'tool.x' }]) {
      expect(() => mapCopilotEvent(garbage)).not.toThrow();
    }
  });
});
