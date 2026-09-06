import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunEvent, RunSpec, RunCallbacks } from '@offhand/shared';
import type { AgentRunner, RunHandle } from '../runner.js';
import { NdjsonParser } from '../ndjson.js';
import { mapClaudeEvent } from './claude-map.js';
import { AsyncEventQueue } from '../async-queue.js';
import type { ApprovalBroker } from '../approvals.js';

const APPROVAL_MCP_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'approval-mcp.mjs');

/**
 * Claude Code headless runner. Flags verified against CLI v2.1.261:
 *   claude -p <prompt> --output-format stream-json --verbose
 *          --include-partial-messages [--model <m>] [--resume <conversation>]
 *
 * Approvals route through our MCP prompt tool when a broker is present;
 * conversation continuity is session-scoped via RunSpec.resumeConversationId
 * (the CLI's session_id is reported back through RunCallbacks).
 */
export class ClaudeCodeRunner implements AgentRunner {
  readonly id = 'claude-code';
  readonly name = 'Claude Code';
  readonly models = ['sonnet', 'opus', 'haiku'];
  readonly supportsApprovals = true;

  constructor(
    private readonly broker?: ApprovalBroker,
    private readonly approvalUrl?: string,
  ) {}

  loggedIn(): boolean {
    return existsSync(join(homedir(), '.claude', '.credentials.json'));
  }

  /** Resolution order: $OFFHAND_CLAUDE_BIN → PATH → native-install default. */
  resolveBin(): string {
    if (process.env.OFFHAND_CLAUDE_BIN) return process.env.OFFHAND_CLAUDE_BIN;
    const native = join(homedir(), '.local', 'bin', 'claude.exe');
    if (process.platform === 'win32' && existsSync(native)) return native;
    return 'claude';
  }

  async detect(): Promise<boolean> {
    return new Promise((resolve) => {
      const p = spawn(this.resolveBin(), ['--version'], { stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('exit', (code) => resolve(code === 0));
    });
  }

  start(run: RunSpec, callbacks?: RunCallbacks): RunHandle {
    const queue = new AsyncEventQueue<RunEvent>();
    const parser = new NdjsonParser();
    let child: ChildProcessByStdio<null, Readable, Readable>;
    let stderrTail = '';
    let sawTerminal = false;
    let reportedConversation = false;

    const emit = (events: RunEvent[]) => {
      for (const e of events) {
        if (e.type === 'done' || e.type === 'error') sawTerminal = true;
        queue.push(e);
      }
    };

    // With a broker: approvals flow to the phone via our MCP prompt tool.
    // Without: acceptEdits keeps local debugging unattended.
    const detachBroker = this.broker?.attach((ev) => queue.push(ev));
    const args = ['-p', run.prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    if (run.model) args.push('--model', run.model);
    if (run.resumeConversationId) args.push('--resume', run.resumeConversationId);
    const mode = run.permissionMode ?? 'guarded';
    if (mode === 'bypass') {
      // No prompts at all — the user opted out of guarding for this session.
      args.push('--permission-mode', 'bypassPermissions');
    } else if (this.broker && this.approvalUrl) {
      if (mode === 'plan') args.push('--permission-mode', 'plan');
      else if (mode === 'acceptEdits') args.push('--permission-mode', 'acceptEdits');
      const mcpConfig = {
        mcpServers: {
          offhand: {
            command: process.execPath,
            args: [APPROVAL_MCP_PATH],
            env: { OFFHAND_APPROVAL_URL: this.approvalUrl },
          },
        },
      };
      args.push(
        '--mcp-config', JSON.stringify(mcpConfig),
        '--strict-mcp-config',
        '--permission-prompt-tool', 'mcp__offhand__approval_prompt',
      );
    } else {
      args.push('--permission-mode', 'acceptEdits');
    }
    // Thinking budget tiers (0 disables extended thinking).
    const thinking = { low: 0, medium: 8_000, high: 16_000, max: 31_999 } as const;
    const env =
      run.effort !== undefined
        ? { ...process.env, MAX_THINKING_TOKENS: String(thinking[run.effort]) }
        : process.env;

    try {
      child = spawn(this.resolveBin(), args, {
        cwd: run.workspace,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });
    } catch (e) {
      detachBroker?.();
      queue.push({ type: 'error', message: `failed to spawn claude: ${String(e)}` });
      queue.close();
      return { events: queue, respond: () => {}, cancel: () => {} };
    }

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const result of parser.push(chunk)) {
        if (result.ok) {
          if (!reportedConversation) {
            const id = extractSessionId(result.value);
            if (id) {
              reportedConversation = true;
              callbacks?.onConversationId?.(id);
            }
          }
          emit(mapClaudeEvent(result.value));
        }
        // Malformed lines are swallowed (never fatal); format churn shows up
        // in the fixture tests, not as dead runs.
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-2000);
    });

    child.on('error', (err) => {
      emit([{ type: 'error', message: `claude process error: ${err.message}` }]);
      queue.close();
    });

    child.on('close', (code) => {
      detachBroker?.();
      for (const result of parser.flush()) {
        if (result.ok) emit(mapClaudeEvent(result.value));
      }
      // Crash of agent CLI (02-architecture.md): exit code + stderr tail into
      // the transcript, never a silent death.
      if (!sawTerminal) {
        emit([
          {
            type: 'error',
            message: `claude exited with code ${code ?? 'unknown'} before a result${
              stderrTail ? `\nstderr: ${stderrTail}` : ''
            }`,
          },
        ]);
      }
      queue.close();
    });

    return {
      events: queue,
      respond: (approvalId, ok, answer) => {
        this.broker?.resolve(approvalId, ok, answer);
      },
      cancel: () => child.kill(),
    };
  }
}

function extractSessionId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.session_id === 'string' && v.session_id !== '' ? v.session_id : null;
}
