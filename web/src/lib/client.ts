import { get } from 'svelte/store';
import {
  ready,
  generateKeyPair,
  derivePhoneKeys,
  decodePairingCode,
  sessionIdFromDaemonKey,
  fingerprint,
  seal,
  open,
  openBytes,
  sealBytes,
  toB64u,
  fromB64u,
  EnvelopeSchema,
  parseServerMessage,
  parseRelayFrame,
  type ClientMessage,
  type ConversationSummary,
  type FsDir,
  type ServerMessage,
  type SessionKeys,
} from '@offhand/shared';
import {
  conn,
  runners,
  workspaces,
  sessions,
  transcripts,
  currentSessionId,
  justPaired,
  addDrop,
  mutateTranscript,
  recomputeWaiting,
  toItems,
  type TranscriptItem,
} from './stores.js';

/**
 * Connection core: pairing, E2E crypto, relay WS, transcript state.
 * History strategy (W3): on first connect we fast-forward to hello.lastSeq
 * and page history in per-session via history-request; live gaps after
 * reconnects are filled with resume { afterSeq }.
 */

export interface StoredPairing {
  relayUrl: string;
  phonePublicKey: string;
  phoneSecretKey: string;
  daemonPublicKey: string;
}

const PAIRING_KEY = 'offhand.pairing';
const SEQ_KEY = 'offhand.lastSeq';
export const DEFAULT_RELAY_URL = 'https://offhand-relay.onrender.com';

let ws: WebSocket | null = null;
let keys: SessionKeys | null = null;
let wsUrl = '';
let relayHttpUrl = '';
let blobSession = '';
let lastSeq = loadLastSeq(); // -1 = never synced; fast-forward on first hello
let retryMs = 500;
let lastMessageAt = 0;
const rpcWaiters = new Map<string, (msg: ServerMessage) => void>();
const historyLoaded = new Set<string>();

export function loadPairing(): StoredPairing | null {
  const raw = localStorage.getItem(PAIRING_KEY);
  return raw ? (JSON.parse(raw) as StoredPairing) : null;
}

export function unpair(): void {
  localStorage.removeItem(PAIRING_KEY);
  localStorage.removeItem(SEQ_KEY);
  location.href = '/';
}

export function sasFingerprint(): string {
  return get(conn).sas;
}

export async function boot(): Promise<void> {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const hashCode = hash.get('pair');
  if (hashCode) {
    history.replaceState(null, '', location.pathname); // never keep codes in history
    const existing = loadPairing();
    if (!existing || confirm('Already paired. Replace the existing pairing?')) {
      try {
        await pairWithCode(hashCode, hash.get('relay') ?? undefined);
        return;
      } catch (e) {
        conn.update((c) => ({ ...c, phase: 'unpaired' }));
        throw e;
      }
    }
  }
  const stored = loadPairing();
  if (!stored) {
    conn.update((c) => ({ ...c, phase: 'unpaired' }));
    return;
  }
  await setupFromPairing(stored);
  connect();
}

export async function pairWithCode(code: string, relayOverride?: string): Promise<void> {
  await ready;
  // QR links may carry the relay as ws(s):// — store the http(s) form.
  const relayUrl = (relayOverride?.trim() || DEFAULT_RELAY_URL)
    .replace(/^ws(s?):\/\//, 'http$1://')
    .replace(/\/$/, '');
  const { token, daemonPublicKey } = decodePairingCode(code.trim());
  const phone = generateKeyPair();
  const res = await fetch(`${relayUrl}/pair/${encodeURIComponent(token)}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phonePublicKey: toB64u(phone.publicKey) }),
  });
  if (!res.ok) throw new Error(`relay said ${res.status} — is the daemon waiting to pair?`);
  const pairing: StoredPairing = {
    relayUrl,
    phonePublicKey: toB64u(phone.publicKey),
    phoneSecretKey: toB64u(phone.secretKey),
    daemonPublicKey: toB64u(daemonPublicKey),
  };
  localStorage.setItem(PAIRING_KEY, JSON.stringify(pairing));
  justPaired.set(true); // set BEFORE the phase flips so the ritual covers the app frame (no flash)
  await setupFromPairing(pairing);
  connect();
}

async function setupFromPairing(p: StoredPairing): Promise<void> {
  await ready;
  const phone = { publicKey: fromB64u(p.phonePublicKey), secretKey: fromB64u(p.phoneSecretKey) };
  const daemonPk = fromB64u(p.daemonPublicKey);
  keys = derivePhoneKeys(phone, daemonPk);
  const sas = fingerprint(daemonPk, phone.publicKey);
  blobSession = sessionIdFromDaemonKey(daemonPk);
  const base = p.relayUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '');
  relayHttpUrl = base;
  wsUrl = `${base.replace(/^http/, 'ws')}/ws?session=${encodeURIComponent(blobSession)}&role=phone`;
  conn.update((c) => ({ ...c, sas, phase: 'connecting' }));
  const { setupPush } = await import('./push.js');
  void setupPush(relayHttpUrl, blobSession);
}

export function send(msg: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !keys) return;
  ws.send(JSON.stringify({ kind: 'peer', payload: seal(msg, keys.tx) }));
}

function connect(): void {
  if (!wsUrl) return;
  conn.update((c) => ({ ...c, phase: 'connecting' }));
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    retryMs = 500;
    conn.update((c) => ({ ...c, phase: 'connected' }));
    send({ type: 'sync' }); // fetch hello + manifest regardless of who connected first
    if (lastSeq >= 0) send({ type: 'resume', afterSeq: lastSeq });
  };

  ws.onmessage = (e) => {
    lastMessageAt = Date.now();
    if (!keys) return;
    let msg: ServerMessage;
    try {
      const frame = parseRelayFrame(String(e.data));
      if (frame.kind === 'presence') {
        conn.update((c) => ({
          ...c,
          daemonOnline: frame.daemonOnline,
          lastSeenMs: frame.lastSeenMs ?? c.lastSeenMs,
        }));
        if (frame.daemonOnline) {
          send({ type: 'sync' });
          if (lastSeq >= 0) send({ type: 'resume', afterSeq: lastSeq });
        }
        return;
      }
      if (frame.kind !== 'peer') return;
      msg = parseServerMessage(JSON.stringify(open(EnvelopeSchema.parse(frame.payload), keys.rx)));
    } catch {
      return; // undecryptable or malformed — dropped, never fatal
    }
    handleServer(msg);
  };

  ws.onclose = () => {
    conn.update((c) => ({ ...c, phase: 'connecting' }));
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 10_000);
  };
}

function handleServer(msg: ServerMessage): void {
  switch (msg.type) {
    case 'hello':
      conn.update((c) => ({ ...c, host: msg.host, daemonOnline: true }));
      if (lastSeq < 0) setLastSeq(msg.lastSeq); // fast-forward; history is paged in
      else if (msg.lastSeq > lastSeq) send({ type: 'resume', afterSeq: lastSeq });
      return;
    case 'manifest':
      runners.set(msg.runners);
      workspaces.set(msg.workspaces);
      sessions.set(msg.sessions);
      return;
    case 'history-response':
    case 'search-response':
    case 'conversations-response':
    case 'fs-response':
      rpcWaiters.get(msg.rpcId)?.(msg);
      rpcWaiters.delete(msg.rpcId);
      return;
    case 'error':
      // Surface global errors into the current session view.
      mutateTranscript(get(currentSessionId) || 'global', (items) => [
        ...items,
        { kind: 'error', seq: setLastSeq(lastSeq + 1), message: msg.message },
      ]);
      return;
    default: {
      // Seq-logged stream
      if ('seq' in msg) {
        if (msg.seq <= lastSeq) return; // replay dedupe
        setLastSeq(msg.seq);
      }
      applyLogged(msg);
    }
  }
}

function applyLogged(msg: ServerMessage): void {
  if (msg.type === 'drop') {
    addDrop({
      seq: msg.seq,
      blobId: msg.blobId,
      name: msg.name,
      mime: msg.mime,
      size: msg.size,
      direction: msg.direction,
    });
    return;
  }
  if (msg.type === 'run-event' && msg.event.type === 'approval-result') {
    const { id, approve, answer } = msg.event;
    mutateTranscript(msg.sessionId, (items) =>
      items.map((i) =>
        i.kind === 'approval' && i.approvalId === id ? { ...i, resolved: approve, answer: answer ?? i.answer } : i,
      ),
    );
    recomputeWaiting();
    return;
  }
  const conv = toItems(msg);
  if (!conv) return;
  mutateTranscript(conv.sessionId, (items) => {
    const merged = [...items];
    for (const item of conv.items) {
      const last = merged[merged.length - 1];
      // Coalesce consecutive text chunks into one row for rendering sanity.
      if (item.kind === 'text' && last?.kind === 'text') {
        merged[merged.length - 1] = { ...last, text: last.text + item.text, seq: item.seq };
      } else if (item.kind === 'done') {
        // The result summary usually repeats the streamed text — drop the echo.
        const dup = last?.kind === 'text' && last.text.trim().endsWith(item.summary.trim());
        merged.push({ ...item, summary: dup ? '' : item.summary });
      } else {
        merged.push(item);
      }
    }
    return merged;
  });
  if (msg.type === 'run-event' && msg.event.type === 'approval') recomputeWaiting();
}

// ---- history paging ----------------------------------------------------------

export async function ensureHistory(sessionId: string): Promise<void> {
  if (historyLoaded.has(sessionId)) return;
  historyLoaded.add(sessionId);
  const res = await rpc({
    type: 'history-request',
    rpcId: crypto.randomUUID(),
    sessionId,
    beforeSeq: 0,
    limit: 100,
  });
  if (res.type !== 'history-response') return;
  const parsed = res.items
    .map((raw) => {
      try {
        return parseServerMessage(JSON.stringify(raw));
      } catch {
        return null;
      }
    })
    .filter((m): m is ServerMessage => m !== null);

  // Build rows oldest-first, resolving approvals from their results.
  const rows: TranscriptItem[] = [];
  const resolutions = new Map<string, { approve: boolean; answer: string | null }>();
  for (const m of parsed) {
    if (m.type === 'run-event' && m.event.type === 'approval-result') {
      resolutions.set(m.event.id, { approve: m.event.approve, answer: m.event.answer ?? null });
      continue;
    }
    const conv = toItems(m);
    if (!conv) continue;
    for (const item of conv.items) {
      const last = rows[rows.length - 1];
      if (item.kind === 'text' && last?.kind === 'text') {
        rows[rows.length - 1] = { ...last, text: last.text + item.text, seq: item.seq };
      } else if (item.kind === 'done') {
        const dup = last?.kind === 'text' && last.text.trim().endsWith(item.summary.trim());
        rows.push({ ...item, summary: dup ? '' : item.summary });
      } else {
        rows.push(item);
      }
    }
  }
  const finalized = rows.map((r) => {
    if (r.kind !== 'approval') return r;
    const v = resolutions.get(r.approvalId);
    return v ? { ...r, resolved: v.approve, answer: v.answer ?? r.answer } : r;
  });

  // Prepend history before any live rows that arrived meanwhile.
  const maxHistSeq = finalized.length ? finalized[finalized.length - 1]!.seq : 0;
  mutateTranscript(sessionId, (live) => [...finalized, ...live.filter((i) => i.seq > maxHistSeq)]);
  recomputeWaiting();
}

function rpc(msg: ClientMessage & { rpcId: string }): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      rpcWaiters.delete(msg.rpcId);
      reject(new Error('rpc timeout'));
    }, 15_000);
    rpcWaiters.set(msg.rpcId, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
    send(msg);
  });
}

export async function searchTranscripts(
  query: string,
): Promise<{ sessionId: string; seq: number; snippet: string }[]> {
  const res = await rpc({ type: 'search-request', rpcId: crypto.randomUUID(), query, limit: 20 });
  return res.type === 'search-response' ? res.results : [];
}

export async function listConversations(workspace: string): Promise<ConversationSummary[]> {
  const res = await rpc({ type: 'conversations-request', rpcId: crypto.randomUUID(), workspace });
  return res.type === 'conversations-response' ? res.conversations : [];
}

export function adoptConversation(workspace: string, conversationId: string, label?: string): void {
  send({
    type: 'session-adopt',
    workspace,
    conversationId,
    ...(label ? { label } : {}),
  });
}

export async function listFolders(path?: string): Promise<{ path: string; parent: string | null; dirs: FsDir[] }> {
  const res = await rpc({
    type: 'fs-list',
    rpcId: crypto.randomUUID(),
    ...(path ? { path } : {}),
  });
  if (res.type !== 'fs-response') throw new Error('unexpected fs response');
  return { path: res.path, parent: res.parent, dirs: res.dirs };
}

// ---- artifacts -----------------------------------------------------------------

export async function fetchArtifact(blobId: string): Promise<Uint8Array> {
  if (!keys) throw new Error('not paired');
  const res = await fetch(
    `${relayHttpUrl}/artifacts/${encodeURIComponent(blobSession)}/${encodeURIComponent(blobId)}`,
  );
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return openBytes(new Uint8Array(await res.arrayBuffer()), keys.rx); // decrypted locally
}

/** Encrypt + upload a file for the daemon to stage as a prompt attachment. */
export async function uploadAttachment(file: File): Promise<{ blobId: string; name: string; mime: string }> {
  if (!keys) throw new Error('not paired');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sealed = sealBytes(bytes, keys.tx);
  const res = await fetch(`${relayHttpUrl}/artifacts/${encodeURIComponent(blobSession)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-content-hint': file.type || 'application/octet-stream' },
    body: sealed as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  const { blobId } = (await res.json()) as { blobId: string };
  return { blobId, name: file.name, mime: file.type || 'application/octet-stream' };
}

export async function sendDrop(file: File): Promise<{ blobId: string; name: string; mime: string; size: number }> {
  const uploaded = await uploadAttachment(file);
  send({ type: 'drop-send', ...uploaded, size: file.size });
  return { ...uploaded, size: file.size };
}

// ---- approvals ------------------------------------------------------------------

export function answerApproval(sessionId: string, approvalId: string, approve: boolean, answer?: string): void {
  send({ type: 'approval-response', approvalId, approve, ...(answer !== undefined ? { answer } : {}) });
  mutateTranscript(sessionId, (items) =>
    items.map((i) =>
      i.kind === 'approval' && i.approvalId === approvalId ? { ...i, resolved: approve, answer: answer ?? null } : i,
    ),
  );
  recomputeWaiting();
}

// ---- iOS resume liveness ---------------------------------------------------------

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !wsUrl) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      retryMs = 500;
      connect();
      return;
    }
    const before = lastMessageAt;
    if (lastSeq >= 0) send({ type: 'resume', afterSeq: lastSeq });
    setTimeout(() => {
      if (lastMessageAt === before && ws) {
        retryMs = 500;
        try {
          ws.close(); // zombie socket → reconnect
        } catch {
          /* ignore */
        }
      }
    }, 4000);
  });
}

function loadLastSeq(): number {
  if (typeof localStorage === 'undefined') return -1;
  const raw = Number(localStorage.getItem(SEQ_KEY));
  return Number.isFinite(raw) && raw >= 0 ? raw : -1;
}

function setLastSeq(seq: number): number {
  lastSeq = seq;
  if (typeof localStorage !== 'undefined') localStorage.setItem(SEQ_KEY, String(seq));
  return seq;
}
