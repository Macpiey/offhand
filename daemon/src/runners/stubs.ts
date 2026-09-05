import { spawn } from 'node:child_process';
import type { RunSpec } from '@offhand/shared';
import type { AgentRunner, RunHandle } from '../runner.js';
import { AsyncEventQueue } from '../async-queue.js';

/**
 * Honest stubs (03-poc-scope.md): detect() genuinely checks the CLI exists;
 * start() states plainly that the runner isn't implemented yet. They must
 * never pretend to work.
 */
function commandExists(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(bin, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  });
}

function notImplemented(id: string): RunHandle {
  const queue = new AsyncEventQueue<never>();
  queue.close();
  return {
    events: (async function* () {
      yield {
        type: 'error' as const,
        message: `${id} runner is not implemented yet (POC ships Claude Code only).`,
      };
    })(),
    respond: () => {},
    cancel: () => {},
  };
}

export class CopilotCliRunner implements AgentRunner {
  readonly id = 'copilot-cli';
  readonly name = 'GitHub Copilot CLI';
  readonly models: string[] = [];
  readonly supportsApprovals = false;
  detect = () => commandExists('copilot');
  start = (_run: RunSpec) => notImplemented(this.id);
}

export class CodexCliRunner implements AgentRunner {
  readonly id = 'codex-cli';
  readonly name = 'OpenAI Codex CLI';
  readonly models: string[] = [];
  readonly supportsApprovals = false;
  detect = () => commandExists('codex');
  start = (_run: RunSpec) => notImplemented(this.id);
}

export class CursorAgentRunner implements AgentRunner {
  readonly id = 'cursor-agent';
  readonly name = 'Cursor';
  readonly models: string[] = [];
  readonly supportsApprovals = false;
  detect = () => commandExists('cursor-agent');
  start = (_run: RunSpec) => notImplemented(this.id);
}

export class GeminiCliRunner implements AgentRunner {
  readonly id = 'gemini-cli';
  readonly name = 'Gemini CLI';
  readonly models: string[] = [];
  readonly supportsApprovals = false;
  detect = () => commandExists('gemini');
  start = (_run: RunSpec) => notImplemented(this.id);
}
