import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ClaudeCodeRunner } from './runners/claude-code.js';
import { CopilotCliRunner, CodexCliRunner } from './runners/stubs.js';
import { SessionCore } from './session-core.js';
import { LocalSessionServer } from './local-server.js';
import { RelayClient } from './relay-client.js';
import { ensurePairing } from './pairing.js';

/**
 * offhand daemon entry point.
 *   pnpm daemon -- --workspace <path> [--port 4317]
 *                  [--relay <url>] [--repair]
 *
 * Relay mode (M3): pairing = X25519 key exchange; every payload E2E
 * encrypted; the session id is derived from the daemon's public key.
 * `--repair` discards the stored pairing and prints a fresh pairing code.
 */
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const workspace = resolve(argValue('--workspace') ?? process.cwd());
const port = Number(argValue('--port') ?? 4317);
const relayUrl = argValue('--relay');
const forceRepair = args.includes('--repair');

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
  const pairing = await ensurePairing(relayUrl, forceRepair);
  new RelayClient(core, relayUrl, pairing.sessionId, pairing.keys).start();
  console.log(`  relay     : ${relayUrl}`);
  console.log(`  session   : ${pairing.sessionId}`);
  console.log(`  E2E SAS   : ${pairing.sas}  (must match the phone)`);
}
