#!/usr/bin/env node
// Trigger a Render deploy for offhand services and wait until it settles.
// The API key lives OUTSIDE the repo in ~/.offhand/render-api-key so agents
// working in this workspace can ship without any secret entering git.
//
// Usage: node scripts/deploy.mjs [web|relay|all]

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SERVICES = {
  web: 'srv-dadpg19t0dsc73fi5fag',
  relay: 'srv-dadovp8n74is73b0g2lg',
};

const target = process.argv[2] ?? 'web';
const ids =
  target === 'all' ? Object.entries(SERVICES) : SERVICES[target] ? [[target, SERVICES[target]]] : null;
if (!ids) {
  console.error(`unknown target "${target}" — use web | relay | all`);
  process.exit(1);
}

let key;
try {
  key = readFileSync(join(homedir(), '.offhand', 'render-api-key'), 'utf8').trim();
} catch {
  console.error('missing ~/.offhand/render-api-key — create it with the Render API key (one line)');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json', 'content-type': 'application/json' };

const TERMINAL = new Set(['live', 'build_failed', 'update_failed', 'canceled']);

async function deploy(name, serviceId) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  if (!res.ok) throw new Error(`${name}: deploy trigger failed (${res.status})`);
  const { id } = await res.json();
  process.stdout.write(`${name}: deploying ${id} `);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const d = await (await fetch(`https://api.render.com/v1/services/${serviceId}/deploys/${id}`, { headers })).json();
    if (TERMINAL.has(d.status)) {
      console.log(`→ ${d.status}${d.commit?.id ? ` (${d.commit.id.slice(0, 7)})` : ''}`);
      if (d.status !== 'live') process.exitCode = 1;
      return;
    }
    process.stdout.write('.');
  }
  console.log('→ timed out waiting');
  process.exitCode = 1;
}

for (const [name, serviceId] of ids) await deploy(name, serviceId);
