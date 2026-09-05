import { z } from 'zod';

/**
 * Protocol v2 (v1 beta): multi-session, manifest, queue, history RPC.
 * All of this travels INSIDE the encrypted envelopes — the relay sees none of it.
 */

// ---- capability manifest ----------------------------------------------------

export const RunnerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  available: z.boolean(),
  loggedIn: z.boolean().optional(),
  version: z.string().optional(),
  /** Model ids the phone may offer; empty = CLI default only. */
  models: z.array(z.string()),
  supportsApprovals: z.boolean(),
});
export type RunnerInfo = z.infer<typeof RunnerInfoSchema>;

export const WorkspaceInfoSchema = z.object({
  path: z.string(),
  label: z.string(),
  gitBranch: z.string().optional(),
  dirty: z.boolean().optional(),
  devUrl: z.string().optional(),
});
export type WorkspaceInfo = z.infer<typeof WorkspaceInfoSchema>;

export const SessionInfoSchema = z.object({
  id: z.string(),
  workspace: z.string(),
  runnerId: z.string(),
  model: z.string().optional(),
  label: z.string(),
  createdAtMs: z.number().int(),
  archived: z.boolean(),
  /** Whether a run is active or prompts are queued right now. */
  busy: z.boolean(),
  queuedPrompts: z.number().int(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const HostInfoSchema = z.object({
  hostname: z.string(),
  os: z.string(),
  daemonVersion: z.string(),
});
export type HostInfo = z.infer<typeof HostInfoSchema>;
