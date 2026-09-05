import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ClaudeCodeRunner } from './runners/claude-code.js';
import { CodexCliRunner, CursorAgentRunner, GeminiCliRunner } from './runners/stubs.js';
import { CopilotCliRunner } from './runners/copilot-cli.js';
import { SessionManager } from './session-manager.js';
import { Store } from './store.js';
import { LocalSessionServer } from './local-server.js';
import { RelayClient } from './relay-client.js';
import { ensurePairing } from './pairing.js';
import { ApprovalBroker } from './approvals.js';
import { captureScreenshot, uploadArtifact } from './capture.js';

/**
 * offhand daemon entry point (v1).
 *   pnpm daemon -- [--workspace <path>]... [--dev-url <url>] [--port 4317]
 *                  [--relay <url>] [--repair] [--approval-timeout <seconds>]
 *                  [--web-url <url>]
 *
 * Workspaces are registered into the local store (~/.offhand); sessions,
 * transcripts, and search live there too. The relay stores nothing.
 */
const args = process.argv.slice(2);
function argValues(flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) out.push(args[i + 1]!);
  }
  return out;
}
const argValue = (flag: string): string | undefined => argValues(flag)[0];

const port = Number(argValue('--port') ?? 4317);
// Accept ws(s):// too — everything downstream expects the http(s) form.
const relayUrl = argValue('--relay')?.replace(/^ws(s?):\/\//, 'http$1://');
const forceRepair = args.includes('--repair');
const approvalTimeoutMs = Number(argValue('--approval-timeout') ?? 300) * 1000;
const webUrl = argValue('--web-url') ?? 'https://offhand-web.onrender.com';
const devUrl = argValue('--dev-url');

const store = new Store();

// Register workspaces from flags (or cwd on first ever run).
const wsArgs = argValues('--workspace').map((w) => resolve(w));
for (const w of wsArgs) {
  if (!existsSync(w)) {
    console.error(`workspace does not exist: ${w}`);
    process.exit(1);
  }
  store.upsertWorkspace(w, wsArgs[0] === w ? devUrl : undefined);
}
if (store.listWorkspaces().length === 0) store.upsertWorkspace(process.cwd(), devUrl);

const broker = new ApprovalBroker(approvalTimeoutMs);
const approvalUrl = `http://127.0.0.1:${port}/approval`;
const runners = [
  new ClaudeCodeRunner(broker, approvalUrl),
  new CopilotCliRunner(),
  new CodexCliRunner(),
  new CursorAgentRunner(),
  new GeminiCliRunner(),
];

const manager = new SessionManager(store, runners);
await manager.init();
broker.policyProvider = () => manager.currentPolicy();

console.log(`offhand daemon v1`);
for (const w of store.listWorkspaces()) {
  console.log(`  workspace : ${w.path}${w.devUrl ? `  (dev: ${w.devUrl})` : ''}`);
}
const m = await manager.manifest();
if (m.type === 'manifest') {
  for (const r of m.runners) {
    console.log(`  runner    : ${r.id.padEnd(12)} ${r.available ? 'available' : 'not found'}`);
  }
}

new LocalSessionServer(manager, port, broker);
console.log(`  local     : ws://127.0.0.1:${port}`);
console.log(`  approvals : timeout ${approvalTimeoutMs / 1000}s then auto-deny`);

if (relayUrl) {
  const pairing = await ensurePairing(relayUrl, forceRepair, webUrl);
  manager.capture = captureScreenshot;
  manager.uploader = (data, hint) =>
    uploadArtifact(relayUrl, pairing.sessionId, data, pairing.keys, hint);
  new RelayClient(manager, relayUrl, pairing.sessionId, pairing.keys).start();
  console.log(`  relay     : ${relayUrl}`);
  console.log(`  session   : ${pairing.sessionId}`);
  console.log(`  E2E SAS   : ${pairing.sas}  (must match the phone)`);
}
