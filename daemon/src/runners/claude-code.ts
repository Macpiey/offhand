import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RunEvent, RunSpec } from '@offhand/shared';
import type { AgentRunner, RunHandle } from '../runner.js';
import { NdjsonParser } from '../ndjson.js';
import { mapClaudeEvent } from './claude-map.js';
import { AsyncEventQueue } from '../async-queue.js';

/**
 * Claude Code headless runner (M1). Flags verified against CLI v2.1.261:
 *   claude -p <prompt> --output-format stream-json --verbose
 *          --include-partial-messages --permission-mode acceptEdits
 *
 * M1 note: `--permission-mode acceptEdits` lets edit-style prompts run
 * unattended in the throwaway workspace. M4 replaces this with the
 * permission-prompt hook so approvals round-trip to the phone.
 */
export class ClaudeCodeRunner implements AgentRunner {
  readonly id = 'claude-code';

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

  start(run: RunSpec): RunHandle {
    const queue = new AsyncEventQueue<RunEvent>();
    const parser = new NdjsonParser();
    let child: ChildProcessByStdio<null, Readable, Readable>;
    let stderrTail = '';
    let sawTerminal = false;

    const emit = (events: RunEvent[]) => {
      for (const e of events) {
        if (e.type === 'done' || e.type === 'error') sawTerminal = true;
        queue.push(e);
      }
    };

    try {
      child = spawn(
        this.resolveBin(),
        [
          '-p',
          run.prompt,
          '--output-format',
          'stream-json',
          '--verbose',
          '--include-partial-messages',
          '--permission-mode',
          'acceptEdits',
        ],
        { cwd: run.workspace, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (e) {
      queue.push({ type: 'error', message: `failed to spawn claude: ${String(e)}` });
      queue.close();
      return { events: queue, respond: () => {}, cancel: () => {} };
    }

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const result of parser.push(chunk)) {
        if (result.ok) emit(mapClaudeEvent(result.value));
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
      respond: () => {
        // M4: wire to the permission-prompt hook. No-op in M1.
      },
      cancel: () => child.kill(),
    };
  }
}
