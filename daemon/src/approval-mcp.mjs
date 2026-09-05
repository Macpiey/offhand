// offhand approval MCP server (plain JS, zero deps — spawned BY claude).
// Newline-delimited JSON-RPC 2.0 over stdio. Exposes one tool,
// `approval_prompt`, named via --permission-prompt-tool
// mcp__offhand__approval_prompt. Each call is forwarded to the daemon's
// local HTTP endpoint (OFFHAND_APPROVAL_URL) which long-polls the phone's
// verdict, then this returns allow/deny to claude.

import { createInterface } from 'node:readline';

const APPROVAL_URL = process.env.OFFHAND_APPROVAL_URL ?? 'http://127.0.0.1:4317/approval';

const TOOL = {
  name: 'approval_prompt',
  description: 'Forwards a permission request to the offhand phone client and waits for the verdict.',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: { type: 'string' },
      input: { type: 'object' },
      tool_use_id: { type: 'string' },
    },
    required: ['tool_name', 'input'],
  },
};

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function callDaemon(args) {
  const res = await fetch(APPROVAL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ toolName: args.tool_name, input: args.input ?? {} }),
  });
  if (!res.ok) return { approve: false, message: `daemon said ${res.status}` };
  return res.json();
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  void handle(msg);
});

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notification — nothing to do

  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'offhand-approvals', version: '0.0.1' },
      });
      return;
    case 'tools/list':
      reply(id, { tools: [TOOL] });
      return;
    case 'tools/call': {
      if (params?.name !== TOOL.name) {
        replyError(id, -32602, `unknown tool: ${params?.name}`);
        return;
      }
      let decision;
      try {
        const verdict = await callDaemon(params.arguments ?? {});
        decision = verdict.approve
          ? { behavior: 'allow', updatedInput: params.arguments?.input ?? {} }
          : { behavior: 'deny', message: verdict.message ?? 'denied from phone' };
      } catch (e) {
        decision = { behavior: 'deny', message: `approval channel error: ${e?.message ?? e}` };
      }
      reply(id, { content: [{ type: 'text', text: JSON.stringify(decision) }] });
      return;
    }
    case 'ping':
      reply(id, {});
      return;
    default:
      replyError(id, -32601, `method not found: ${method}`);
  }
}
