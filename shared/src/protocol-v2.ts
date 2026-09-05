import { z } from 'zod';
import { RunEventSchema } from './run-events.js';
import {
  RunnerInfoSchema,
  WorkspaceInfoSchema,
  SessionInfoSchema,
  HostInfoSchema,
  ApprovalPolicySchema,
} from './manifest.js';

/**
 * Protocol v2 messages (phone ⇄ daemon, always inside encrypted envelopes).
 * Backwards-incompatible with v1 on purpose — POC pairings are re-paired.
 *
 * Transport contract unchanged since M1: the daemon owns a seq-numbered log;
 * `resume { afterSeq }` replays with no gaps; clients dedupe by seq.
 */

// ---- phone → daemon ---------------------------------------------------------

export const ClientMessageSchema = z.discriminatedUnion('type', [
  /** Queue a prompt in a session (runs serially per session). */
  z.object({
    type: z.literal('prompt'),
    sessionId: z.string(),
    prompt: z.string().min(1),
  }),
  z.object({ type: z.literal('cancel'), sessionId: z.string() }),
  z.object({
    type: z.literal('approval-response'),
    approvalId: z.string(),
    approve: z.boolean(),
  }),
  z.object({ type: z.literal('resume'), afterSeq: z.number().int().nonnegative() }),

  // Session management
  z.object({
    type: z.literal('session-create'),
    workspace: z.string(),
    runnerId: z.string(),
    model: z.string().optional(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('session-update'),
    sessionId: z.string(),
    label: z.string().optional(),
    model: z.string().optional(),
    archived: z.boolean().optional(),
  }),
  /** Start a fresh agent conversation inside the session. */
  z.object({ type: z.literal('session-reset'), sessionId: z.string() }),

  /** Set a workspace's approval policy (enforced by the daemon). */
  z.object({
    type: z.literal('policy-set'),
    workspace: z.string(),
    policy: ApprovalPolicySchema,
  }),

  // History RPC (request/response by rpcId; responses are not in the seq log)
  z.object({
    type: z.literal('history-request'),
    rpcId: z.string(),
    sessionId: z.string(),
    /** Return items with seq < beforeSeq (0 = latest page). */
    beforeSeq: z.number().int().nonnegative(),
    limit: z.number().int().positive().max(200),
  }),
  z.object({
    type: z.literal('search-request'),
    rpcId: z.string(),
    query: z.string().min(1),
    limit: z.number().int().positive().max(50),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---- daemon → phone ---------------------------------------------------------

/** Structured end-of-run summary — the data behind the receipt card. */
export const ReceiptSchema = z.object({
  runId: z.string(),
  ok: z.boolean(),
  durationMs: z.number().int(),
  filesChanged: z.number().int(),
  additions: z.number().int(),
  deletions: z.number().int(),
  /** Unified diff of the run's changes, capped; empty when no changes. */
  diff: z.string(),
  toolCount: z.number().int(),
  screenshotBlobId: z.string().optional(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocol: z.literal(2),
    host: HostInfoSchema,
    lastSeq: z.number().int().nonnegative(),
  }),
  /** Full capability + session state; re-sent whenever it changes. */
  z.object({
    type: z.literal('manifest'),
    runners: z.array(RunnerInfoSchema),
    workspaces: z.array(WorkspaceInfoSchema),
    sessions: z.array(SessionInfoSchema),
  }),

  // Seq-logged transcript stream (all carry sessionId + seq)
  z.object({
    type: z.literal('run-started'),
    sessionId: z.string(),
    runId: z.string(),
    seq: z.number().int(),
    prompt: z.string(),
  }),
  z.object({
    type: z.literal('run-event'),
    sessionId: z.string(),
    runId: z.string(),
    seq: z.number().int(),
    event: RunEventSchema,
  }),
  z.object({
    type: z.literal('receipt'),
    sessionId: z.string(),
    seq: z.number().int(),
    receipt: ReceiptSchema,
  }),

  // RPC responses (not seq-logged)
  z.object({
    type: z.literal('history-response'),
    rpcId: z.string(),
    items: z.array(z.unknown()), // seq-logged ServerMessages, oldest first
    hasMore: z.boolean(),
  }),
  z.object({
    type: z.literal('search-response'),
    rpcId: z.string(),
    results: z.array(
      z.object({ sessionId: z.string(), seq: z.number().int(), snippet: z.string() }),
    ),
  }),

  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const parseClientMessage = (raw: string): ClientMessage =>
  ClientMessageSchema.parse(JSON.parse(raw));
export const parseServerMessage = (raw: string): ServerMessage =>
  ServerMessageSchema.parse(JSON.parse(raw));
