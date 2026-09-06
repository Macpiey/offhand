import { randomUUID } from 'node:crypto';
import { hostname, platform, tmpdir } from 'node:os';
import { existsSync, mkdirSync, readdirSync, writeFileSync, type Dirent } from 'node:fs';
import { dirname, join, basename, parse, resolve } from 'node:path';
import type {
  ClientMessage,
  FsDir,
  ServerMessage,
  RunEvent,
  RunnerInfo,
  SessionInfo,
  WorkspaceInfo,
} from '@offhand/shared';
import type { AgentRunner, RunHandle } from './runner.js';
import { Store, type SessionRow } from './store.js';
import { workspaceInfo, buildReceipt, shouldScreenshot } from './receipts.js';
import { listClaudeConversations } from './claude-history.js';

export type Sink = (msg: ServerMessage) => void;

export interface ArtifactUploader {
  (data: Uint8Array, contentHint: string): Promise<string>; // returns blobId
}

export interface CaptureFn {
  (url: string): Promise<Uint8Array>;
}

const DAEMON_VERSION = '0.1.0';

/**
 * v1 session manager: multiple persistent sessions, per-session prompt
 * queues (serial execution), receipts, manifest broadcasting. Transports
 * (local WS, relay client) attach as sinks; the seq-numbered log lives in
 * the Store and replays with no gaps.
 */
export class SessionManager {
  private sinks = new Set<Sink>();
  private active = new Map<string, RunHandle>(); // sessionId → running handle
  private activeWorkspaces = new Map<string, string>(); // sessionId → workspace
  private queues = new Map<string, string[]>(); // sessionId → queued prompts
  private runners = new Map<string, AgentRunner>();
  private runnerAvailability = new Map<string, boolean>();

  /** Optional artifact plumbing (set by index when capture is possible). */
  uploader: ArtifactUploader | null = null;
  capture: CaptureFn | null = null;
  /** Fetch + decrypt a phone-uploaded attachment blob (set by index). */
  attachmentFetcher: ((blobId: string) => Promise<Uint8Array>) | null = null;

  constructor(
    readonly store: Store,
    runners: AgentRunner[],
  ) {
    for (const r of runners) this.runners.set(r.id, r);
  }

  /** Policy of the workspace whose run is currently awaiting approval. */
  currentPolicy(): 'paranoid' | 'balanced' | 'trusting' {
    const workspaces = [...this.activeWorkspaces.values()];
    if (workspaces.length !== 1) return 'balanced'; // ambiguous → safe default
    return this.store.listWorkspaces().find((w) => w.path === workspaces[0])?.policy ?? 'balanced';
  }

  async init(): Promise<void> {
    for (const [id, r] of this.runners) {
      this.runnerAvailability.set(id, await r.detect());
    }
  }

  // ---- transport attachment --------------------------------------------------

  attach(sink: Sink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  hello(): ServerMessage {
    return {
      type: 'hello',
      protocol: 2,
      host: { hostname: hostname(), os: platform(), daemonVersion: DAEMON_VERSION },
      lastSeq: this.store.lastSeq(),
    };
  }

  async manifest(): Promise<ServerMessage> {
    const runners: RunnerInfo[] = [...this.runners.values()].map((r) => ({
      id: r.id,
      name: r.name,
      available: this.runnerAvailability.get(r.id) ?? false,
      ...(r.loggedIn ? { loggedIn: r.loggedIn() } : {}),
      models: r.models,
      supportsApprovals: r.supportsApprovals,
    }));
    const workspaces: WorkspaceInfo[] = await Promise.all(
      this.store.listWorkspaces().map((w) => workspaceInfo(w)),
    );
    const sessions: SessionInfo[] = this.store
      .listSessions()
      .map((s) =>
        this.store.toSessionInfo(s, this.active.has(s.id), this.queues.get(s.id)?.length ?? 0),
      );
    return { type: 'manifest', runners, workspaces, sessions };
  }

  private broadcast(msg: ServerMessage): void {
    for (const sink of this.sinks) sink(msg);
  }

  private async broadcastManifest(): Promise<void> {
    this.broadcast(await this.manifest());
  }

  /** Append to the durable log and fan out. */
  private record(sessionId: string, build: (seq: number) => ServerMessage): void {
    this.broadcast(this.store.append(sessionId, build));
  }

  // ---- message handling --------------------------------------------------------

  handle(msg: ClientMessage, reply: Sink): void {
    void this.handleAsync(msg, reply);
  }

  private async handleAsync(msg: ClientMessage, reply: Sink): Promise<void> {
    switch (msg.type) {
      case 'prompt': {
        const session = this.store.getSession(msg.sessionId);
        if (!session) {
          reply({ type: 'error', message: `unknown session ${msg.sessionId}` });
          return;
        }
        let prompt = msg.prompt;
        if (msg.attachments?.length && this.attachmentFetcher) {
          try {
            prompt += '\n\nAttached files (read them from disk):';
            for (const a of msg.attachments) {
              const bytes = await this.attachmentFetcher(a.blobId);
              const dir = join(tmpdir(), 'offhand-attachments');
              mkdirSync(dir, { recursive: true });
              const path = join(dir, `${a.blobId.slice(0, 8)}-${basename(a.name)}`);
              writeFileSync(path, bytes);
              prompt += `\n- ${path} (${a.mime})`;
            }
          } catch (e) {
            reply({ type: 'error', message: `attachment staging failed: ${String(e)}` });
            return;
          }
        }
        const q = this.queues.get(session.id) ?? [];
        q.push(prompt);
        this.queues.set(session.id, q);
        this.pump(session.id);
        await this.broadcastManifest();
        return;
      }
      case 'cancel':
        this.active.get(msg.sessionId)?.cancel();
        this.queues.set(msg.sessionId, []);
        return;
      case 'approval-response':
        // Any active run may own it; respond() is a no-op for wrong runs.
        for (const handle of this.active.values()) handle.respond(msg.approvalId, msg.approve, msg.answer);
        return;
      case 'sync':
        // Phones connect to the relay after the daemon did — they ask for the
        // handshake instead of hoping to catch the daemon's own broadcast.
        reply(this.hello());
        reply(await this.manifest());
        return;
      case 'resume':
        for (const m of this.store.replayAfter(msg.afterSeq)) reply(m);
        return;
      case 'session-create': {
        const row = this.store.createSession(msg.workspace, msg.runnerId, msg.model, msg.label);
        this.store.upsertWorkspace(msg.workspace);
        await this.broadcastManifest();
        void row;
        return;
      }
      case 'session-adopt': {
        const row = this.store.createSession(msg.workspace, 'claude-code');
        const found = listClaudeConversations(msg.workspace).find((c) => c.conversationId === msg.conversationId);
        this.store.updateSession(row.id, {
          conversationId: msg.conversationId,
          label: msg.label ?? conversationLabel(found?.firstPrompt, msg.conversationId),
        });
        this.store.upsertWorkspace(msg.workspace);
        await this.broadcastManifest();
        return;
      }
      case 'session-update':
        this.store.updateSession(msg.sessionId, {
          ...(msg.label !== undefined ? { label: msg.label } : {}),
          ...(msg.model !== undefined ? { model: msg.model || null } : {}),
          ...(msg.archived !== undefined ? { archived: msg.archived } : {}),
          ...(msg.permissionMode !== undefined ? { permissionMode: msg.permissionMode } : {}),
          ...(msg.effort !== undefined ? { effort: msg.effort } : {}),
        });
        await this.broadcastManifest();
        return;
      case 'session-reset':
        this.store.updateSession(msg.sessionId, { conversationId: null });
        return;
      case 'policy-set':
        this.store.setWorkspacePolicy(msg.workspace, msg.policy);
        await this.broadcastManifest();
        return;
      case 'history-request': {
        const { items, hasMore } = this.store.historyPage(msg.sessionId, msg.beforeSeq, msg.limit);
        reply({ type: 'history-response', rpcId: msg.rpcId, items, hasMore });
        return;
      }
      case 'search-request':
        reply({
          type: 'search-response',
          rpcId: msg.rpcId,
          results: this.store.search(msg.query, msg.limit),
        });
        return;
      case 'conversations-request':
        reply({
          type: 'conversations-response',
          rpcId: msg.rpcId,
          conversations: listClaudeConversations(msg.workspace),
        });
        return;
      case 'fs-list':
        reply({ type: 'fs-response', rpcId: msg.rpcId, ...listFolders(msg.path) });
        return;
    }
  }

  // ---- run execution -------------------------------------------------------------

  /** Start the next queued prompt for a session, if idle. */
  private pump(sessionId: string): void {
    if (this.active.has(sessionId)) return;
    const q = this.queues.get(sessionId);
    const prompt = q?.shift();
    if (!prompt) return;
    const session = this.store.getSession(sessionId);
    if (!session) return;
    void this.runOne(session, prompt);
  }

  private async runOne(session: SessionRow, prompt: string): Promise<void> {
    const runner = this.runners.get(session.runnerId);
    if (!runner || !(this.runnerAvailability.get(session.runnerId) ?? false)) {
      this.record(session.id, (seq) => ({
        type: 'run-event',
        sessionId: session.id,
        runId: '',
        seq,
        event: { type: 'error', message: `runner ${session.runnerId} is not available` },
      }));
      return;
    }

    const runId = randomUUID();
    const startedAt = Date.now();
    const touchedFiles: string[] = [];
    let toolCount = 0;
    let succeeded = false;

    const handle = runner.start(
      {
        runId,
        prompt,
        workspace: session.workspace,
        ...(session.model ? { model: session.model } : {}),
        ...(session.conversationId ? { resumeConversationId: session.conversationId } : {}),
        permissionMode: session.permissionMode,
        ...(session.effort ? { effort: session.effort } : {}),
      },
      {
        onConversationId: (id) => this.store.updateSession(session.id, { conversationId: id }),
      },
    );
    this.active.set(session.id, handle);
    this.activeWorkspaces.set(session.id, session.workspace);
    this.record(session.id, (seq) => ({
      type: 'run-started',
      sessionId: session.id,
      runId,
      seq,
      prompt,
    }));
    void this.broadcastManifest();

    try {
      for await (const event of handle.events) {
        if (event.type === 'done') succeeded = true;
        trackTouches(event, touchedFiles);
        if (event.type === 'tool') toolCount++;
        this.record(session.id, (seq) => ({
          type: 'run-event',
          sessionId: session.id,
          runId,
          seq,
          event,
        }));
      }
    } finally {
      this.active.delete(session.id);
      this.activeWorkspaces.delete(session.id);
    }

    await this.emitReceipt(session, runId, succeeded, Date.now() - startedAt, touchedFiles, toolCount);
    this.pump(session.id); // next queued prompt
    void this.broadcastManifest();
  }

  private async emitReceipt(
    session: SessionRow,
    runId: string,
    ok: boolean,
    durationMs: number,
    touchedFiles: string[],
    toolCount: number,
  ): Promise<void> {
    try {
      const receipt = await buildReceipt(session.workspace, runId, ok, durationMs, touchedFiles, toolCount);
      const ws = this.store.listWorkspaces().find((w) => w.path === session.workspace);
      if (ok && this.capture && this.uploader && shouldScreenshot(touchedFiles, ws?.devUrl ?? null)) {
        try {
          const png = await this.capture(ws!.devUrl!);
          receipt.screenshotBlobId = await this.uploader(png, 'image/png');
        } catch {
          // Screenshot is garnish, not dinner — receipt ships without it.
        }
      }
      this.record(session.id, (seq) => ({ type: 'receipt', sessionId: session.id, seq, receipt }));
    } catch (e) {
      this.record(session.id, (seq) => ({
        type: 'run-event',
        sessionId: session.id,
        runId,
        seq,
        event: { type: 'error', message: `receipt failed: ${e instanceof Error ? e.message : String(e)}` },
      }));
    }
  }
}

function trackTouches(event: RunEvent, touched: string[]): void {
  if (event.type !== 'tool') return;
  if (!/^(Edit|Write|MultiEdit|NotebookEdit)/.test(event.name)) return;
  const m = /: (.+)$/.exec(event.summary);
  if (m?.[1]) touched.push(m[1].replace(/…$/, ''));
}

function conversationLabel(firstPrompt: string | undefined, conversationId: string): string {
  const fallback = `Imported ${conversationId.slice(0, 8)}`;
  const text = firstPrompt?.trim() || fallback;
  return text.length <= 56 ? text : `${text.slice(0, 55)}…`;
}

function listFolders(path: string | undefined): { path: string; parent: string | null; dirs: FsDir[] } {
  if (!path) return { path: '', parent: null, dirs: driveRoots() };

  const current = resolve(path);
  const dirs = safeReadDir(current)
    .filter((entry) => entry.isDirectory() && !skipDir(entry.name))
    .map((entry) => {
      const full = join(current, entry.name);
      return { name: entry.name, path: full, isGit: existsSync(join(full, '.git')) };
    })
    .sort((a, b) => Number(b.isGit) - Number(a.isGit) || a.name.localeCompare(b.name))
    .slice(0, 200);

  return { path: current, parent: isRoot(current) ? null : dirname(current), dirs };
}

function driveRoots(): FsDir[] {
  if (process.platform !== 'win32') return [{ name: '/', path: '/', isGit: existsSync('/.git') }];
  const roots: FsDir[] = [];
  for (let code = 67; code <= 90; code++) {
    const name = `${String.fromCharCode(code)}:\\`;
    if (existsSync(name)) roots.push({ name, path: name, isGit: existsSync(join(name, '.git')) });
  }
  return roots.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
}

function safeReadDir(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

const SYSTEM_DIRS = new Set([
  'node_modules',
  '$recycle.bin',
  'system volume information',
  'appdata',
  'windows',
  'program files',
  'program files (x86)',
]);

function skipDir(name: string): boolean {
  return name.startsWith('.') || SYSTEM_DIRS.has(name.toLowerCase());
}

function isRoot(path: string): boolean {
  return stripTrailing(path).toLowerCase() === stripTrailing(parse(path).root).toLowerCase();
}

function stripTrailing(path: string): string {
  return path.replace(/[\\/]+$/, '');
}
