import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ServerMessage, SessionInfo } from '@offhand/shared';

/**
 * Daemon-local persistence (v1 W1): sessions, the seq-numbered transcript
 * log, workspace registry, and FTS search. Lives entirely on the laptop —
 * the relay never sees any of it (E2E story).
 */

export interface SessionRow {
  id: string;
  workspace: string;
  runnerId: string;
  model: string | null;
  label: string;
  createdAtMs: number;
  archived: boolean;
  conversationId: string | null;
}

export interface WorkspaceRow {
  path: string;
  label: string;
  devUrl: string | null;
  policy: 'paranoid' | 'balanced' | 'trusting';
}

export class Store {
  private db: DatabaseSync;

  constructor(dir = process.env.OFFHAND_HOME ?? join(homedir(), '.offhand')) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, 'offhand.db'));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace TEXT NOT NULL,
        runner_id TEXT NOT NULL,
        model TEXT,
        label TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        conversation_id TEXT
      );
      CREATE TABLE IF NOT EXISTS log (
        seq INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS log_session ON log(session_id, seq);
      CREATE TABLE IF NOT EXISTS workspaces (
        path TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        dev_url TEXT
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS log_fts USING fts5(text, session_id UNINDEXED, seq UNINDEXED);
    `);
    // Migration: policy column (added in W3).
    try {
      this.db.exec(`ALTER TABLE workspaces ADD COLUMN policy TEXT NOT NULL DEFAULT 'balanced'`);
    } catch {
      /* column exists */
    }
  }

  // ---- sessions -------------------------------------------------------------

  createSession(workspace: string, runnerId: string, model?: string, label?: string): SessionRow {
    const row: SessionRow = {
      id: randomUUID().slice(0, 8),
      workspace,
      runnerId,
      model: model ?? null,
      label: label ?? `${basename(workspace)} · ${runnerId}`,
      createdAtMs: Date.now(),
      archived: false,
      conversationId: null,
    };
    this.db
      .prepare(
        `INSERT INTO sessions (id, workspace, runner_id, model, label, created_at_ms, archived, conversation_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
      )
      .run(row.id, row.workspace, row.runnerId, row.model, row.label, row.createdAtMs);
    return row;
  }

  listSessions(): SessionRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM sessions ORDER BY created_at_ms DESC`)
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      workspace: r.workspace as string,
      runnerId: r.runner_id as string,
      model: (r.model as string | null) ?? null,
      label: r.label as string,
      createdAtMs: Number(r.created_at_ms),
      archived: Boolean(r.archived),
      conversationId: (r.conversation_id as string | null) ?? null,
    }));
  }

  getSession(id: string): SessionRow | undefined {
    return this.listSessions().find((s) => s.id === id);
  }

  updateSession(
    id: string,
    patch: Partial<Pick<SessionRow, 'label' | 'model' | 'archived' | 'conversationId'>>,
  ): void {
    const current = this.getSession(id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE sessions SET label = ?, model = ?, archived = ?, conversation_id = ? WHERE id = ?`,
      )
      .run(next.label, next.model, next.archived ? 1 : 0, next.conversationId, id);
  }

  toSessionInfo(row: SessionRow, busy: boolean, queued: number): SessionInfo {
    return {
      id: row.id,
      workspace: row.workspace,
      runnerId: row.runnerId,
      model: row.model ?? undefined,
      label: row.label,
      createdAtMs: row.createdAtMs,
      archived: row.archived,
      busy,
      queuedPrompts: queued,
    };
  }

  // ---- transcript log ---------------------------------------------------------

  /** Appends and returns the assigned global seq. */
  append(sessionId: string, buildMsg: (seq: number) => ServerMessage): ServerMessage {
    const next =
      Number(
        (this.db.prepare(`SELECT COALESCE(MAX(seq), 0) AS s FROM log`).get() as { s: number }).s,
      ) + 1;
    const msg = buildMsg(next);
    this.db
      .prepare(`INSERT INTO log (seq, session_id, json) VALUES (?, ?, ?)`)
      .run(next, sessionId, JSON.stringify(msg));
    const text = searchableText(msg);
    if (text) {
      this.db
        .prepare(`INSERT INTO log_fts (text, session_id, seq) VALUES (?, ?, ?)`)
        .run(text, sessionId, next);
    }
    return msg;
  }

  lastSeq(): number {
    return Number(
      (this.db.prepare(`SELECT COALESCE(MAX(seq), 0) AS s FROM log`).get() as { s: number }).s,
    );
  }

  replayAfter(afterSeq: number, limit = 500): ServerMessage[] {
    const rows = this.db
      .prepare(`SELECT json FROM log WHERE seq > ? ORDER BY seq ASC LIMIT ?`)
      .all(afterSeq, limit) as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as ServerMessage);
  }

  historyPage(sessionId: string, beforeSeq: number, limit: number): { items: ServerMessage[]; hasMore: boolean } {
    const bound = beforeSeq === 0 ? Number.MAX_SAFE_INTEGER : beforeSeq;
    const rows = this.db
      .prepare(
        `SELECT json FROM log WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`,
      )
      .all(sessionId, bound, limit + 1) as { json: string }[];
    const hasMore = rows.length > limit;
    return {
      items: rows
        .slice(0, limit)
        .reverse()
        .map((r) => JSON.parse(r.json) as ServerMessage),
      hasMore,
    };
  }

  search(query: string, limit: number): { sessionId: string; seq: number; snippet: string }[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT session_id, seq, snippet(log_fts, 0, '»', '«', '…', 12) AS snip
           FROM log_fts WHERE log_fts MATCH ? ORDER BY rank LIMIT ?`,
        )
        .all(query, limit) as Record<string, unknown>[];
      return rows.map((r) => ({
        sessionId: r.session_id as string,
        seq: Number(r.seq),
        snippet: r.snip as string,
      }));
    } catch {
      return []; // malformed FTS query — empty result, never a crash
    }
  }

  // ---- workspaces -------------------------------------------------------------

  upsertWorkspace(path: string, devUrl?: string): void {
    this.db
      .prepare(
        `INSERT INTO workspaces (path, label, dev_url) VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET dev_url = COALESCE(excluded.dev_url, workspaces.dev_url)`,
      )
      .run(path, basename(path), devUrl ?? null);
  }

  listWorkspaces(): WorkspaceRow[] {
    const rows = this.db.prepare(`SELECT * FROM workspaces`).all() as Record<string, unknown>[];
    return rows.map((r) => ({
      path: r.path as string,
      label: r.label as string,
      devUrl: (r.dev_url as string | null) ?? null,
      policy: (r.policy as WorkspaceRow['policy']) ?? 'balanced',
    }));
  }

  setWorkspacePolicy(path: string, policy: WorkspaceRow['policy']): void {
    this.db.prepare(`UPDATE workspaces SET policy = ? WHERE path = ?`).run(policy, path);
  }
}

/** Extract the human-searchable text of a logged message for FTS. */
function searchableText(msg: ServerMessage): string {
  switch (msg.type) {
    case 'run-started':
      return msg.prompt;
    case 'run-event':
      if (msg.event.type === 'text') return msg.event.chunk;
      if (msg.event.type === 'tool') return msg.event.summary;
      if (msg.event.type === 'done') return msg.event.summary;
      if (msg.event.type === 'error') return msg.event.message;
      return '';
    default:
      return '';
  }
}
