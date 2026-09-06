# Graph Report - .  (2026-09-06)

## Corpus Check
- Corpus is ~38,227 words - fits in a single context window. You may not need a graph.

## Summary
- 628 nodes · 1085 edges · 48 communities (37 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.78)
- Token cost: 113,455 input · 0 output

## Community Hubs (Navigation)
- Agent Runner Core & Run Events
- E2E Pairing & Crypto
- Web Client & Reactive Stores
- Relay Package Manifest
- Daemon Package Manifest
- Web Package Manifest
- Relay Server & Push Service
- Session Store & Protocol Messages
- Shared Package Manifest
- Project Docs & Deploy Config
- Approval Broker & Local WS Server
- Root Package Manifest
- Phone/PC File Drop Handoff
- Shared Protocol Schemas
- Session Manager Core
- Claude Conversation History Import
- Workspace Folder Browsing
- Approval Sheet UI
- Base TS Config
- Settings & Agent Install UI
- Receipt Generation (diff/screenshot)
- Navigation Drawer & Session List
- Approval MCP Tool
- Composer & Onboarding UI
- Daemon Relay Client
- Session Creation Page
- Daemon TS Config
- Web TS Config
- Shared TS Config
- Relay TS Config
- Web Push Subscription
- Voice Input
- Service Worker
- PWA Manifest & Icon (512)
- Svelte Config
- pnpm Build Allowlist
- pnpm libsodium Patch
- iOS Icon Asset (180)
- Android Icon Asset (192)

## God Nodes (most connected - your core abstractions)
1. `SessionManager` - 21 edges
2. `Store` - 19 edges
3. `ApprovalBroker` - 14 edges
4. `AgentRunner` - 14 edges
5. `ServerMessage` - 14 edges
6. `RunEvent` - 13 edges
7. `buildApp()` - 12 edges
8. `compilerOptions` - 11 edges
9. `RunHandle` - 10 edges
10. `toB64u()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `web workspace package entry` --semantically_similar_to--> `web/ package (M1 bare transcript page → SvelteKit PWA from M2/M6)`  [INFERRED] [semantically similar]
  pnpm-workspace.yaml → README.md
- `shared workspace package entry` --semantically_similar_to--> `shared/ package (protocol types + zod schemas)`  [INFERRED] [semantically similar]
  pnpm-workspace.yaml → README.md
- `daemon workspace package entry` --semantically_similar_to--> `daemon/ package (laptop CLI, runner interface, Claude Code runner, local WS server)`  [INFERRED] [semantically similar]
  pnpm-workspace.yaml → README.md
- `relay workspace package entry` --semantically_similar_to--> `relay/ package (cloud relay, placeholder until M2)`  [INFERRED] [semantically similar]
  pnpm-workspace.yaml → README.md
- `Dev (M1) command sequence` --references--> `Per-project Node pin via devEngines.runtime`  [AMBIGUOUS]
  README.md → pnpm-workspace.yaml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **offhand monorepo packages (shared/daemon/relay/web)** — readme_shared_package, readme_daemon_package, readme_relay_package, readme_web_package [INFERRED 0.85]
- **pnpm-workspace.yaml packages list** — pnpm_workspace_packages_shared, pnpm_workspace_packages_daemon, pnpm_workspace_packages_relay, pnpm_workspace_packages_web [EXTRACTED 1.00]
- **SvelteKit PWA boot/recovery shell pattern** — web_src_app_shell, web_src_error_shell, web_src_error_recovery_mechanism [INFERRED 0.80]

## Communities (48 total, 11 thin omitted)

### Community 0 - "Agent Runner Core & Run Events"
Cohesion: 0.06
Nodes (34): AsyncEventQueue, RunEventQueue, NdjsonParser, NdjsonResult, AgentRunner, RunHandle, APPROVAL_MCP_PATH, ClaudeCodeRunner (+26 more)

### Community 1 - "E2E Pairing & Crypto"
Cohesion: 0.09
Nodes (41): captureScreenshot(), downloadArtifact(), uploadArtifact(), args, argValue(), argValues(), broker, devUrl (+33 more)

### Community 2 - "Web Client & Reactive Stores"
Cohesion: 0.08
Nodes (41): HostInfo, parseServerMessage(), adoptConversation(), answerApproval(), applyLogged(), boot(), connect(), ensureHistory() (+33 more)

### Community 3 - "Relay Package Manifest"
Cohesion: 0.05
Nodes (37): fastify, @fastify/cors, @fastify/websocket, dependencies, fastify, @fastify/cors, @fastify/websocket, @offhand/shared (+29 more)

### Community 4 - "Daemon Package Manifest"
Cohesion: 0.06
Nodes (32): dependencies, @offhand/shared, playwright, qrcode-terminal, ws, zod, devDependencies, tsx (+24 more)

### Community 5 - "Web Package Manifest"
Cohesion: 0.06
Nodes (31): jsqr, svelte-check, @sveltejs/adapter-static, @sveltejs/kit, @sveltejs/vite-plugin-svelte, vite, dependencies, gsap (+23 more)

### Community 6 - "Relay Server & Push Service"
Cohesion: 0.15
Nodes (14): broadcastPresence(), buildApp(), PairingAnswerSchema, PendingPairing, safeSend(), sendPresence(), Session, app (+6 more)

### Community 7 - "Session Store & Protocol Messages"
Cohesion: 0.13
Nodes (5): searchableText(), Store, WorkspaceRow, SessionInfo, ServerMessage

### Community 8 - "Shared Package Manifest"
Cohesion: 0.10
Nodes (20): libsodium-wrappers, dependencies, libsodium-wrappers, zod, devDependencies, @types/libsodium-wrappers, typescript, vitest (+12 more)

### Community 9 - "Project Docs & Deploy Config"
Cohesion: 0.13
Nodes (20): Per-project Node pin via devEngines.runtime, daemon workspace package entry, relay workspace package entry, shared workspace package entry, web workspace package entry, Claude Code CLI (external dependency, must be installed and logged in), daemon/ package (laptop CLI, runner interface, Claude Code runner, local WS server), Dev (M1) command sequence (+12 more)

### Community 10 - "Approval Broker & Local WS Server"
Cohesion: 0.22
Nodes (10): ApprovalBroker, AskQuestion, buildPreview(), classifyRisk(), firstQuestion(), summariseInput(), truncate(), Verdict (+2 more)

### Community 11 - "Root Package Manifest"
Cohesion: 0.11
Nodes (17): devDependencies, devEngines, runtime, engines, node, name, packageManager, private (+9 more)

### Community 12 - "Phone/PC File Drop Handoff"
Cohesion: 0.18
Nodes (12): dedupeDropName(), dropOutboxDir(), mimeFromName(), psQuote(), queueDropFileForPhone(), readOutgoingDrop(), safeDropName(), safeEntries() (+4 more)

### Community 13 - "Shared Protocol Schemas"
Cohesion: 0.16
Nodes (15): ApprovalPolicySchema, HostInfoSchema, RunnerInfo, RunnerInfoSchema, SessionInfoSchema, WorkspaceInfo, WorkspaceInfoSchema, ClientMessageSchema (+7 more)

### Community 15 - "Claude Conversation History Import"
Cohesion: 0.27
Nodes (12): collapseText(), DEFAULT_PROJECTS_DIR, encodeWorkspace(), findProjectDir(), isRecord(), listClaudeConversations(), listJsonlFiles(), readLines() (+4 more)

### Community 16 - "Workspace Folder Browsing"
Cohesion: 0.21
Nodes (13): ArtifactFetcher, ArtifactUploader, CaptureFn, conversationLabel(), driveRoots(), isRoot(), listFolders(), safeReadDir() (+5 more)

### Community 17 - "Approval Sheet UI"
Cohesion: 0.15
Nodes (6): canAnswer, del, holding, other, otherText, progress

### Community 18 - "Base TS Config"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+3 more)

### Community 19 - "Settings & Agent Install UI"
Cohesion: 0.22
Nodes (3): archived, installedAgents, missingAgents

### Community 21 - "Receipt Generation (diff/screenshot)"
Cohesion: 0.36
Nodes (7): buildReceipt(), exec, git(), shouldScreenshot(), workspaceInfo(), SessionRow, Receipt

### Community 23 - "Approval MCP Tool"
Cohesion: 0.43
Nodes (7): callDaemon(), handle(), reply(), replyError(), rl, send(), TOOL

### Community 27 - "Daemon TS Config"
Cohesion: 0.33
Nodes (5): extends, include, src, test, ../tsconfig.base.json

### Community 29 - "Web TS Config"
Cohesion: 0.33
Nodes (5): ./.svelte-kit/tsconfig.json, compilerOptions, moduleResolution, strict, extends

### Community 30 - "Shared TS Config"
Cohesion: 0.33
Nodes (5): extends, include, src, test, ../tsconfig.base.json

### Community 31 - "Relay TS Config"
Cohesion: 0.40
Nodes (4): extends, include, src, ../tsconfig.base.json

### Community 32 - "Web Push Subscription"
Cohesion: 0.60
Nodes (3): requestPushPermission(), setupPush(), subscribe()

### Community 33 - "Voice Input"
Cohesion: 0.60
Nodes (4): impl(), listen(), SR, voiceAvailable()

### Community 34 - "Service Worker"
Cohesion: 0.50
Nodes (3): ASSETS, PushData, sw

## Ambiguous Edges - Review These
- `Dev (M1) command sequence` → `Per-project Node pin via devEngines.runtime`  [AMBIGUOUS]
  README.md · relation: references

## Knowledge Gaps
- **186 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+181 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Dev (M1) command sequence` and `Per-project Node pin via devEngines.runtime`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `Store` connect `Session Store & Protocol Messages` to `Workspace Folder Browsing`, `E2E Pairing & Crypto`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `ServerMessage` connect `Session Store & Protocol Messages` to `E2E Pairing & Crypto`, `Web Client & Reactive Stores`, `Approval Broker & Local WS Server`, `Shared Protocol Schemas`, `Session Manager Core`, `Workspace Folder Browsing`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `SessionManager` connect `Session Manager Core` to `E2E Pairing & Crypto`, `Session Store & Protocol Messages`, `Approval Broker & Local WS Server`, `Phone/PC File Drop Handoff`, `Workspace Folder Browsing`, `Receipt Generation (diff/screenshot)`, `Daemon Relay Client`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _186 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agent Runner Core & Run Events` be split into smaller, more focused modules?**
  _Cohesion score 0.05837837837837838 - nodes in this community are weakly interconnected._
- **Should `E2E Pairing & Crypto` be split into smaller, more focused modules?**
  _Cohesion score 0.08816326530612245 - nodes in this community are weakly interconnected._