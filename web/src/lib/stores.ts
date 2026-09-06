import { writable, get } from 'svelte/store';
import type {
  ClientMessage,
  ServerMessage,
  Receipt,
  RunnerInfo,
  SessionInfo,
  WorkspaceInfo,
  HostInfo,
} from '@offhand/shared';

/** One rendered row of a session transcript. */
export type TranscriptItem =
  | { kind: 'prompt'; seq: number; text: string }
  | { kind: 'text'; seq: number; text: string }
  | { kind: 'tool'; seq: number; summary: string }
  | {
      kind: 'approval';
      seq: number;
      approvalId: string;
      action: string;
      detail: string;
      risk: 'low' | 'high';
      preview: string | null;
      question: { text: string; options: { label: string; description?: string }[]; multiSelect?: boolean } | null;
      resolved: null | boolean;
      answer: string | null;
    }
  | { kind: 'receipt'; seq: number; receipt: Receipt }
  | { kind: 'done'; seq: number; summary: string }
  | { kind: 'error'; seq: number; message: string };

export interface ConnState {
  phase: 'boot' | 'unpaired' | 'connecting' | 'connected';
  daemonOnline: boolean;
  lastSeenMs: number | null;
  sas: string;
  host: HostInfo | null;
}

export interface DropItem {
  seq: number;
  blobId: string;
  name: string;
  mime: string;
  size: number;
  direction: 'to-phone' | 'to-pc';
  atMs: number;
}

export const conn = writable<ConnState>({
  phase: 'boot',
  daemonOnline: false,
  lastSeenMs: null,
  sas: '',
  host: null,
});

export const runners = writable<RunnerInfo[]>([]);
export const workspaces = writable<WorkspaceInfo[]>([]);
export const sessions = writable<SessionInfo[]>([]);
/** sessionId → transcript rows (newest last). */
export const transcripts = writable<Map<string, TranscriptItem[]>>(new Map());
export const currentSessionId = writable<string>(
  typeof localStorage !== 'undefined' ? (localStorage.getItem('offhand.currentSession') ?? '') : '',
);
/** Sessions with an unresolved approval — powers the "waiting on you" UI. */
export const waiting = writable<Set<string>>(new Set());

/** True right after a successful pairing — the layout shows the verify ritual. */
export const justPaired = writable(false);

/** Slide-in navigation drawer (phone layout). */
export const drawerOpen = writable(false);
/** Home listens: opens the New-session sheet (triggerable from the drawer). */
export const newSessionOpen = writable(false);
/** sessionId → last reported context usage + cumulative run cost. */
export const usageBySession = writable<
  Map<string, { contextTokens: number; contextWindow: number; costUsd: number }>
>(new Map());
export const drops = writable<DropItem[]>(loadDrops());

currentSessionId.subscribe((id) => {
  if (typeof localStorage !== 'undefined' && id) localStorage.setItem('offhand.currentSession', id);
});
drops.subscribe((items) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem('offhand.drops', JSON.stringify(items.slice(0, 100)));
});

export function mutateTranscript(
  sessionId: string,
  fn: (items: TranscriptItem[]) => TranscriptItem[],
): void {
  transcripts.update((m) => {
    const next = new Map(m);
    next.set(sessionId, fn(next.get(sessionId) ?? []));
    return next;
  });
}

export function recomputeWaiting(): void {
  const m = get(transcripts);
  const set = new Set<string>();
  for (const [sid, items] of m) {
    if (items.some((i) => i.kind === 'approval' && i.resolved === null)) set.add(sid);
  }
  waiting.set(set);
}

export function addDrop(drop: Omit<DropItem, 'atMs'>): void {
  drops.update((items) => {
    if (items.some((d) => d.seq === drop.seq)) return items;
    return [...items, { ...drop, atMs: Date.now() }].sort((a, b) => b.seq - a.seq);
  });
}

/** Convert a seq-logged server message into a transcript row (or null). */
export function toItems(msg: ServerMessage): { sessionId: string; items: TranscriptItem[] } | null {
  switch (msg.type) {
    case 'run-started':
      return { sessionId: msg.sessionId, items: [{ kind: 'prompt', seq: msg.seq, text: msg.prompt }] };
    case 'receipt':
      return { sessionId: msg.sessionId, items: [{ kind: 'receipt', seq: msg.seq, receipt: msg.receipt }] };
    case 'run-event': {
      const ev = msg.event;
      switch (ev.type) {
        case 'text':
          return { sessionId: msg.sessionId, items: [{ kind: 'text', seq: msg.seq, text: ev.chunk }] };
        case 'tool':
          return { sessionId: msg.sessionId, items: [{ kind: 'tool', seq: msg.seq, summary: ev.summary }] };
        case 'approval':
          return {
            sessionId: msg.sessionId,
            items: [
              {
                kind: 'approval',
                seq: msg.seq,
                approvalId: ev.id,
                action: ev.action,
                detail: ev.detail,
                risk: ev.risk,
                preview: ev.preview ?? null,
                question: ev.question ?? null,
                resolved: null,
                answer: null,
              },
            ],
          };
        case 'approval-result':
          // handled separately (mutates an existing row)
          return null;
        case 'artifact':
          return null; // v1: artifacts arrive via receipts
        case 'usage': {
          usageBySession.update((m) => {
            const next = new Map(m);
            const prev = next.get(msg.sessionId);
            next.set(msg.sessionId, {
              contextTokens: ev.contextTokens,
              contextWindow: ev.contextWindow,
              costUsd: (prev?.costUsd ?? 0) + (ev.costUsd ?? 0),
            });
            return next;
          });
          return null; // accounting, not a transcript row
        }
        case 'done':
          return { sessionId: msg.sessionId, items: [{ kind: 'done', seq: msg.seq, summary: ev.summary }] };
        case 'error':
          return { sessionId: msg.sessionId, items: [{ kind: 'error', seq: msg.seq, message: ev.message }] };
      }
      return null;
    }
    default:
      return null;
  }
}

export type { ClientMessage, ServerMessage };

function loadDrops(): DropItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem('offhand.drops') ?? '[]') as DropItem[];
    return raw.filter((d) => typeof d.seq === 'number' && typeof d.blobId === 'string');
  } catch {
    return [];
  }
}
