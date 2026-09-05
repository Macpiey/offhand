import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { RunEvent, RunSpec, RunCallbacks } from '@offhand/shared';
import type { AgentRunner, RunHandle } from '../runner.js';
import { NdjsonParser } from '../ndjson.js';
import { mapCopilotEvent, extractCopilotSessionId } from './copilot-map.js';
import { AsyncEventQueue } from '../async-queue.js';

/**
 * GitHub Copilot CLI runner (W2). Verified against CLI 1.0.31:
 *   copilot -p <prompt> --output-format json --stream on --allow-all-tools
 *           [--model <m>] [--resume <sessionId>]
 *
 * Honest capability note: Copilot's non-interactive mode has no permission
 * prompt hook — tools must be pre-allowed, so `supportsApprovals: false`
 * (the phone UI can warn that this agent runs without approval gates).
 *
 * Windows: npm ships a .cmd shim that Node cannot spawn directly; we resolve
 * the underlying npm-loader.js and spawn `node` on it.
 */
export class CopilotCliRunner implements AgentRunner {
  readonly id = 'copilot-cli';
  readonly name = 'GitHub Copilot CLI';
  readonly models: string[] = []; // no headless enumeration in 1.0.31; CLI default
  readonly supportsApprovals = false;

  /** [command, ...prefixArgs] resolved once. */
  private resolved: string[] | null = null;

  private resolveCommand(): string[] | null {
    if (this.resolved) return this.resolved;
    if (process.platform === 'win32') {
      // Find copilot.cmd on PATH, then target its npm-loader.js with node.
      for (const dir of (process.env.PATH ?? '').split(delimiter)) {
        if (!dir) continue;
        const loader = join(dir, 'node_modules', '@github', 'copilot', 'npm-loader.js');
        if (existsSync(join(dir, 'copilot.cmd')) && existsSync(loader)) {
          this.resolved = [process.execPath, loader];
          return this.resolved;
        }
      }
      // Native installer location fallback.
      const native = join(homedir(), 'AppData', 'Local', 'copilot', 'copilot.exe');
      if (existsSync(native)) {
        this.resolved = [native];
        return this.resolved;
      }
      return null;
    }
    this.resolved = ['copilot'];
    return this.resolved;
  }

  async detect(): Promise<boolean> {
    const cmd = this.resolveCommand();
    if (!cmd) return false;
    return new Promise((resolve) => {
      const p = spawn(cmd[0]!, [...cmd.slice(1), '--version'], { stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('exit', (code) => resolve(code === 0));
    });
  }

  loggedIn(): boolean {
    return existsSync(join(homedir(), '.copilot'));
  }

  start(run: RunSpec, callbacks?: RunCallbacks): RunHandle {
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

    const cmd = this.resolveCommand();
    if (!cmd) {
      queue.push({ type: 'error', message: 'copilot CLI not found' });
      queue.close();
      return { events: queue, respond: () => {}, cancel: () => {} };
    }

    const args = [
      ...cmd.slice(1),
      '-p',
      run.prompt,
      '--output-format',
      'json',
      '--stream',
      'on',
      // Non-interactive Copilot requires pre-granted tools (no prompt hook).
      '--allow-all-tools',
      '--no-color',
    ];
    if (run.model) args.push('--model', run.model);
    if (run.resumeConversationId) args.push('--resume', run.resumeConversationId);

    try {
      child = spawn(cmd[0]!, args, {
        cwd: run.workspace,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      queue.push({ type: 'error', message: `failed to spawn copilot: ${String(e)}` });
      queue.close();
      return { events: queue, respond: () => {}, cancel: () => {} };
    }

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const result of parser.push(chunk)) {
        if (result.ok) {
          const sid = extractCopilotSessionId(result.value);
          if (sid) callbacks?.onConversationId?.(sid);
          emit(mapCopilotEvent(result.value));
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-2000);
    });

    child.on('error', (err) => {
      emit([{ type: 'error', message: `copilot process error: ${err.message}` }]);
      queue.close();
    });

    child.on('close', (code) => {
      for (const result of parser.flush()) {
        if (result.ok) emit(mapCopilotEvent(result.value));
      }
      if (!sawTerminal) {
        emit([
          {
            type: 'error',
            message: `copilot exited with code ${code ?? 'unknown'} before a result${
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
        // Copilot non-interactive has no approval hook; nothing to feed.
      },
      cancel: () => child.kill(),
    };
  }
}
