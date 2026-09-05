import type { RunEvent, RunSpec, RunCallbacks } from '@offhand/shared';

/**
 * Pluggable runner interface — 02-architecture.md contract, extended for v1:
 * model metadata, login detection, and run callbacks for conversation ids.
 * Normalising CLI output into RunEvent is the highest-risk area of the
 * product; everything CLI-specific stays behind this line.
 */
export interface AgentRunner {
  id: 'claude-code' | 'copilot-cli' | 'codex-cli' | string;
  /** Human-readable name for the phone's agent picker. */
  name: string;
  /** Model ids/aliases the phone may offer; empty = CLI default only. */
  models: string[];
  /** Whether this runner routes permission prompts to the phone. */
  supportsApprovals: boolean;
  /** Is the CLI installed (and usable)? Must be honest — never half-work. */
  detect(): Promise<boolean>;
  /** Best-effort login detection; undefined = unknown. */
  loggedIn?(): boolean;
  /** Spawn a headless run in the workspace cwd. */
  start(run: RunSpec, callbacks?: RunCallbacks): RunHandle;
}

export interface RunHandle {
  events: AsyncIterable<RunEvent>;
  /** Feed an approval verdict back to the agent. */
  respond(approvalId: string, ok: boolean): void;
  cancel(): void;
}
