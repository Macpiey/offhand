import { describe, it, expect } from 'vitest';
import { mapClaudeEvent } from '../src/runners/claude-map.js';

describe('mapClaudeEvent', () => {
  it('ignores system init', () => {
    expect(mapClaudeEvent({ type: 'system', subtype: 'init' })).toEqual([]);
  });

  it('maps text deltas to text chunks', () => {
    const line = {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
    };
    expect(mapClaudeEvent(line)).toEqual([{ type: 'text', chunk: 'Hi' }]);
  });

  it('ignores non-text deltas (thinking, input_json)', () => {
    const line = {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } },
    };
    expect(mapClaudeEvent(line)).toEqual([]);
  });

  it('maps tool_use blocks with a summarised input', () => {
    const line = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'already streamed as deltas' },
          { type: 'tool_use', name: 'Edit', input: { file_path: 'C:\\x\\index.html' } },
          { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
        ],
      },
    };
    expect(mapClaudeEvent(line)).toEqual([
      { type: 'tool', name: 'Edit', summary: 'Edit: C:\\x\\index.html' },
      { type: 'tool', name: 'Bash', summary: 'Bash: npm test' },
    ]);
  });

  it('maps success result to done', () => {
    const line = { type: 'result', subtype: 'success', is_error: false, result: 'All changed.' };
    expect(mapClaudeEvent(line)).toEqual([{ type: 'done', summary: 'All changed.' }]);
  });

  it('maps error result to error (e.g. not logged in)', () => {
    const line = { type: 'result', is_error: true, result: 'Not logged in · Please run /login' };
    expect(mapClaudeEvent(line)).toEqual([
      { type: 'error', message: 'Not logged in · Please run /login' },
    ]);
  });

  it('never throws on garbage shapes', () => {
    for (const garbage of [null, 42, 'x', [], {}, { type: 'assistant' }, { type: 'result' }, { type: 'stream_event' }]) {
      expect(() => mapClaudeEvent(garbage)).not.toThrow();
    }
  });
});
