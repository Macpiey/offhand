# offhand (codename)

Phone→coding-agent relay. Laptop daemon wraps headless agent CLIs; relay routes
E2E-encrypted messages; phone PWA drives prompts, transcripts, artifacts, approvals.

**Source of truth:** the doc pack at `C:\Users\udbha\Documents\agent-relay-docs\`
(vision, product spec, architecture, POC scope, roadmap, decision log). The POC
scope doc is binding.

## Packages

| Package | What |
|---|---|
| `shared/` | Protocol types + zod schemas (crypto envelope helpers arrive in M3) |
| `daemon/` | Laptop CLI: runner interface, Claude Code runner, local WS server (M1) |
| `relay/` | Cloud relay — placeholder until M2 |
| `web/` | M1 bare transcript page (becomes the SvelteKit PWA from M2/M6) |

## Dev (M1)

```
pnpm install
pnpm daemon -- --workspace <path-to-test-project>   # local WS on :4317
pnpm web                                            # bare page on :5173
pnpm test                                           # parser fuzz + mapping tests
```

Requires Claude Code CLI installed and logged in (`claude /login`). Node is
pinned per-project via `useNodeVersion` in pnpm-workspace.yaml.
