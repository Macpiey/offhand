import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { ClaudeCodeRunner } from './runners/claude-code.js';
import { CopilotCliRunner, CodexCliRunner } from './runners/stubs.js';
import { SessionCore } from './session-core.js';
import { LocalSessionServer } from './local-server.js';
import { RelayClient } from './relay-client.js';

/**
 * offhand daemon entry point.
 *   pnpm daemon -- --workspace <path> [--port 4317]
 *                  [--relay <url> [--session <id>]]
 *
 * M2 session ids are shared secrets typed into the phone client; real pairing
 * (QR + key exchange) replaces this in M3.
 */
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const workspace = resolve(argValue('--workspace') ?? process.cwd());
const port = Number(argValue('--port') ?? 4317);
const relayUrl = argValue('--relay');
const sessionId = argValue('--session') ?? randomBytes(9).toString('base64url');

if (!existsSync(workspace)) {
  console.error(`workspace does not exist: ${workspace}`);
  process.exit(1);
}

const runners = [new ClaudeCodeRunner(), new CopilotCliRunner(), new CodexCliRunner()];

console.log(`offhand daemon`);
console.log(`  workspace : ${workspace}`);
let primaryAvailable = false;
for (const r of runners) {
  const ok = await r.detect();
  if (r === runners[0]) primaryAvailable = ok;
  console.log(`  runner    : ${r.id.padEnd(11)} ${ok ? 'available' : 'not found'}`);
}

const core = new SessionCore(runners[0]!, workspace, primaryAvailable);

new LocalSessionServer(core, port);
console.log(`  local     : ws://127.0.0.1:${port}`);

if (relayUrl) {
  new RelayClient(core, relayUrl, sessionId).start();
  console.log(`  relay     : ${relayUrl}`);
  console.log(`  session   : ${sessionId}  (enter this in the phone client)`);
}
