import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listClaudeConversations } from '../src/claude-history.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(process.cwd(), '.test-tmp-claude-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('listClaudeConversations', () => {
  it('summarizes user prompts from Claude JSONL and skips malformed lines', () => {
    const workspace = 'C:\\Users\\tester\\dev\\demo.project';
    const project = join(dir, 'C--Users-tester-dev-demo-project');
    mkdirSync(project, { recursive: true });
    const file = join(project, 'conversation-1.jsonl');
    const nestedDir = join(project, 'sessions');
    const nestedFile = join(nestedDir, 'conversation-2.jsonl');
    mkdirSync(nestedDir);
    writeFileSync(
      file,
      [
        '{bad json',
        JSON.stringify({ type: 'assistant', message: { content: 'ignored' } }),
        JSON.stringify({ type: 'user', message: { content: 'First prompt\nwith spacing' } }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'text', text: 'second' }, { type: 'image', source: 'ignored' }] },
        }),
      ].join('\n'),
    );
    writeFileSync(nestedFile, JSON.stringify({ type: 'user', message: { content: 'newer nested prompt' } }));
    const time = new Date('2024-02-03T04:05:06Z');
    const later = new Date('2024-02-03T04:06:06Z');
    utimesSync(file, time, time);
    utimesSync(nestedFile, later, later);

    expect(listClaudeConversations(workspace, dir)).toEqual([
      {
        conversationId: 'conversation-2',
        workspace,
        firstPrompt: 'newer nested prompt',
        lastActiveMs: later.getTime(),
        messageCount: 1,
      },
      {
        conversationId: 'conversation-1',
        workspace,
        firstPrompt: 'First prompt with spacing',
        lastActiveMs: time.getTime(),
        messageCount: 2,
      },
    ]);
  });
});
