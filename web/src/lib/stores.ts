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
      resolved: null | boolean;
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

currentSessionId.subscribe((id) => {
  if (typeof localStorage !== 'undefined' && id) localStorage.setItem('offhand.currentSession', id);
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
                resolved: null,
              },
            ],
          };
        case 'approval-result':
          // handled separately (mutates an existing row)
          return null;
        case 'artifact':
          return null; // v1: artifacts arrive via receipts
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
