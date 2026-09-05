import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'offhand-store-'));
  store = new Store(dir);
});

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* windows file locks — best effort */
  }
});

describe('Store', () => {
  it('creates, lists, and updates sessions', () => {
    const s = store.createSession('C:\\proj', 'claude-code', 'sonnet');
    expect(store.listSessions()).toHaveLength(1);
    store.updateSession(s.id, { label: 'renamed', conversationId: 'conv-1' });
    const got = store.getSession(s.id)!;
    expect(got.label).toBe('renamed');
    expect(got.conversationId).toBe('conv-1');
    store.updateSession(s.id, { archived: true });
    expect(store.getSession(s.id)!.archived).toBe(true);
  });

  it('appends seq-ordered log and replays with no gaps', () => {
    const s = store.createSession('C:\\proj', 'claude-code');
    for (let i = 0; i < 5; i++) {
      store.append(s.id, (seq) => ({
        type: 'run-event',
        sessionId: s.id,
        runId: 'r1',
        seq,
        event: { type: 'text', chunk: `chunk ${i}` },
      }));
    }
    expect(store.lastSeq()).toBe(5);
    const replay = store.replayAfter(2);
    expect(replay).toHaveLength(3);
    expect(replay.map((m) => ('seq' in m ? m.seq : -1))).toEqual([3, 4, 5]);
  });

  it('pages history per session, newest window first, oldest-first inside', () => {
    const a = store.createSession('C:\\a', 'claude-code');
    const b = store.createSession('C:\\b', 'claude-code');
    for (let i = 0; i < 6; i++) {
      const target = i % 2 === 0 ? a : b;
      store.append(target.id, (seq) => ({
        type: 'run-event',
        sessionId: target.id,
        runId: 'r',
        seq,
        event: { type: 'text', chunk: `m${i}` },
      }));
    }
    const page = store.historyPage(a.id, 0, 2);
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    const seqs = page.items.map((m) => ('seq' in m ? (m as { seq: number }).seq : -1));
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y)); // oldest-first
  });

  it('full-text search finds prompts and text', () => {
    const s = store.createSession('C:\\proj', 'claude-code');
    store.append(s.id, (seq) => ({
      type: 'run-started',
      sessionId: s.id,
      runId: 'r1',
      seq,
      prompt: 'fix the flaky checkout test',
    }));
    const hits = store.search('checkout', 10);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.sessionId).toBe(s.id);
    expect(store.search('nonexistentterm42', 10)).toHaveLength(0);
    expect(store.search('AND OR (', 10)).toEqual([]); // malformed query is safe
  });

  it('registers workspaces idempotently, preserving devUrl', () => {
    store.upsertWorkspace('C:\\proj', 'http://localhost:3000');
    store.upsertWorkspace('C:\\proj');
    const [w] = store.listWorkspaces();
    expect(w!.devUrl).toBe('http://localhost:3000');
  });
});
