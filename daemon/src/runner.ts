import type { RunEvent, RunSpec } from '@offhand/shared';

/**
 * Pluggable runner interface — 02-architecture.md, verbatim contract.
 * Normalising CLI output into RunEvent is the highest-risk area of the
 * product; everything CLI-specific stays behind this line.
 */
export interface AgentRunner {
  id: 'claude-code' | 'copilot-cli' | 'codex-cli' | string;
  /** Is the CLI installed (and usable)? Must be honest — never half-work. */
  detect(): Promise<boolean>;
  /** Spawn a headless run in the workspace cwd. */
  start(run: RunSpec): RunHandle;
}

export interface RunHandle {
  events: AsyncIterable<RunEvent>;
  /** Feed an approval verdict back to the agent (wired for real in M4). */
  respond(approvalId: string, ok: boolean): void;
  cancel(): void;
}
