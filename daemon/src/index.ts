import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ClaudeCodeRunner } from './runners/claude-code.js';
import { CopilotCliRunner, CodexCliRunner } from './runners/stubs.js';
import { LocalSessionServer } from './server.js';

/**
 * offhand daemon — M1 entry point.
 *   pnpm daemon -- --workspace <path> [--port 4317]
 */
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const workspace = resolve(argValue('--workspace') ?? process.cwd());
const port = Number(argValue('--port') ?? 4317);

if (!existsSync(workspace)) {
  console.error(`workspace does not exist: ${workspace}`);
  process.exit(1);
}

const runners = [new ClaudeCodeRunner(), new CopilotCliRunner(), new CodexCliRunner()];

console.log(`offhand daemon (M1)`);
console.log(`  workspace : ${workspace}`);
for (const r of runners) {
  const ok = await r.detect();
  console.log(`  runner    : ${r.id.padEnd(11)} ${ok ? 'available' : 'not found'}`);
}

new LocalSessionServer(runners[0]!, workspace, port);
console.log(`  listening : ws://127.0.0.1:${port}`);
