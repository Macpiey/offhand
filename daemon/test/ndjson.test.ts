import { describe, it, expect } from 'vitest';
import { NdjsonParser } from '../src/ndjson.js';

const FIXTURE_OBJECTS = [
  { type: 'system', subtype: 'init', tools: ['Bash', 'Edit'] },
  { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello 👋 world' } } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'C:\\proj\\index.html' } }] } },
  { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'multi\nline "quoted" text' } } },
  { type: 'result', subtype: 'success', is_error: false, result: 'done ✅' },
];

function feedInChunks(parser: NdjsonParser, text: string, boundaries: number[]): unknown[] {
  const out: unknown[] = [];
  let prev = 0;
  for (const b of [...boundaries, text.length]) {
    for (const r of parser.push(text.slice(prev, b))) {
      expect(r.ok, `parse failure: ${JSON.stringify(r)}`).toBe(true);
      if (r.ok) out.push(r.value);
    }
    prev = b;
  }
  for (const r of parser.flush()) if (r.ok) out.push(r.value);
  return out;
}

describe('NdjsonParser', () => {
  const ndjson = FIXTURE_OBJECTS.map((o) => JSON.stringify(o)).join('\n') + '\n';

  it('parses whole input in one chunk', () => {
    expect(feedInChunks(new NdjsonParser(), ndjson, [])).toEqual(FIXTURE_OBJECTS);
  });

  it('parses one byte at a time', () => {
    const boundaries = Array.from({ length: ndjson.length - 1 }, (_, i) => i + 1);
    expect(feedInChunks(new NdjsonParser(), ndjson, boundaries)).toEqual(FIXTURE_OBJECTS);
  });

  it('handles CRLF line endings', () => {
    const crlf = FIXTURE_OBJECTS.map((o) => JSON.stringify(o)).join('\r\n') + '\r\n';
    expect(feedInChunks(new NdjsonParser(), crlf, [7, 8, 9])).toEqual(FIXTURE_OBJECTS);
  });

  it('handles missing trailing newline via flush()', () => {
    const noTrail = FIXTURE_OBJECTS.map((o) => JSON.stringify(o)).join('\n');
    expect(feedInChunks(new NdjsonParser(), noTrail, [3])).toEqual(FIXTURE_OBJECTS);
  });

  it('reports malformed lines without dying', () => {
    const parser = new NdjsonParser();
    const results = parser.push('{"ok":1}\nnot json at all\n{"ok":2}\n');
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
  });

  it('fuzz: 500 random chunkings produce identical output', () => {
    // Deterministic PRNG so failures are reproducible.
    let seed = 0xdecafbad;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (let trial = 0; trial < 500; trial++) {
      const boundaries = [...new Set(
        Array.from({ length: 1 + Math.floor(rand() * 12) }, () =>
          1 + Math.floor(rand() * (ndjson.length - 1)),
        ),
      )].sort((a, b) => a - b);
      const out = feedInChunks(new NdjsonParser(), ndjson, boundaries);
      expect(out, `trial ${trial} boundaries ${boundaries.join(',')}`).toEqual(FIXTURE_OBJECTS);
    }
  });
});
