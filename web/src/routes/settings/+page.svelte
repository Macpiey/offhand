<script lang="ts">
  import { conn, workspaces, runners, sessions } from '$lib/stores.js';
  import { send, unpair, loadPairing, DEFAULT_RELAY_URL } from '$lib/client.js';
  import { requestPushPermission, pushGranted } from '$lib/push.js';
  import { sessionIdFromDaemonKey, fromB64u, type ApprovalPolicy } from '@offhand/shared';

  const POLICIES: { id: ApprovalPolicy; label: string; hint: string }[] = [
    { id: 'paranoid', label: 'Paranoid', hint: 'Ask for everything the agent would ask.' },
    { id: 'balanced', label: 'Balanced', hint: 'Ask for writes and commands. The default.' },
    { id: 'trusting', label: 'Trusting', hint: 'Auto-approve low-risk. Ask only for high-risk actions.' },
  ];

  let pushOn = $state(pushGranted());
  const pairing = loadPairing();
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function enablePush(): Promise<void> {
    if (!pairing) return;
    const session = sessionIdFromDaemonKey(fromB64u(pairing.daemonPublicKey));
    pushOn = await requestPushPermission(pairing.relayUrl ?? DEFAULT_RELAY_URL, session);
  }

  function setPolicy(workspace: string, policy: ApprovalPolicy): void {
    send({ type: 'policy-set', workspace, policy });
  }

  const archived = $derived($sessions.filter((s) => s.archived));
</script>

<div class="page">
  <h1>Settings</h1>

  <section>
    <h2>Connection</h2>
    <div class="card">
      <div class="kv">
        <span>Daemon</span>
        <span>{$conn.host ? `${$conn.host.hostname} · v${$conn.host.daemonVersion}` : 'offline'}</span>
      </div>
      <div class="kv">
        <span>Encryption</span>
        <span class="sas">🔒 {$conn.sas || '—'}</span>
      </div>
      <p class="hint">The fingerprint must match the one your daemon printed — that's your proof nobody sits in the middle.</p>
    </div>
  </section>

  <section>
    <h2>Notifications</h2>
    <div class="card">
      {#if isIOS && !isStandalone}
        <p class="hint">📲 Install the app first (Share → <strong>Add to Home Screen</strong>). iOS only delivers notifications to installed apps.</p>
      {:else if pushOn}
        <p class="hint ok">✓ Approval notifications are on.</p>
      {:else}
        <button onclick={enablePush}>Enable notifications</button>
        <p class="hint">Get pinged the moment your agent needs a decision.</p>
      {/if}
    </div>
  </section>

  <section>
    <h2>Approvals</h2>
    {#each $workspaces as w (w.path)}
      <div class="card">
        <div class="ws-name">{w.label}{#if w.gitBranch}<span class="branch"> {w.gitBranch}</span>{/if}</div>
        <div class="seg">
          {#each POLICIES as p (p.id)}
            <button class="seg-btn" class:active={w.policy === p.id} onclick={() => setPolicy(w.path, p.id)}>
              {p.label}
            </button>
          {/each}
        </div>
        <p class="hint">{POLICIES.find((p) => p.id === w.policy)?.hint}</p>
      </div>
    {/each}
  </section>

  <section>
    <h2>Agents</h2>
    <div class="card">
      {#each $runners as r (r.id)}
        <div class="kv">
          <span class:dim={!r.available}>{r.name}</span>
          <span class="tags">
            {#if !r.available}<span class="tag">not installed</span>
            {:else}
              {#if r.loggedIn === false}<span class="tag warn">signed out</span>{/if}
              {#if !r.supportsApprovals}<span class="tag warn">unguarded</span>{/if}
              <span class="tag ok">ready</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  </section>

  {#if archived.length > 0}
    <section>
      <h2>Archived</h2>
      <div class="card">
        {#each archived as s (s.id)}
          <div class="kv">
            <span class="dim">{s.label}</span>
            <button class="mini" onclick={() => send({ type: 'session-update', sessionId: s.id, archived: false })}>Restore</button>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section>
    <button
      class="danger"
      onclick={() => confirm('Unpair this device? You will need to scan a new code.') && unpair()}
    >Unpair this device</button>
  </section>
</div>

<style>
  .page { padding: 0.5rem 1.25rem 2rem; display: flex; flex-direction: column; gap: 1.35rem; }
  h1 { font: 600 26px/1.2 var(--font-display); letter-spacing: -0.02em; margin: 0.5rem 0 0; }
  h2 {
    font-size: 12px;
    font-weight: 700;
    color: var(--faint);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 0.5rem 0.25rem;
  }
  section { display: flex; flex-direction: column; }
  .card {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 0.9rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .card + .card { margin-top: 0.6rem; }
  .kv { display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-size: 14px; }
  .kv > span:first-child { color: var(--muted); }
  .sas { color: var(--ok); font-family: var(--font-mono); font-size: 13px; }
  .hint { color: var(--faint); font-size: 12.5px; margin: 0; }
  .hint.ok { color: var(--ok); }
  .ws-name { font-weight: 600; }
  .branch { color: var(--faint); font-family: var(--font-mono); font-size: 12px; font-weight: 400; margin-left: 0.5rem; }
  .seg { display: flex; background: var(--bg); border-radius: 999px; padding: 3px; }
  .seg-btn {
    flex: 1;
    background: transparent;
    color: var(--muted);
    font-size: 12.5px;
    padding: 0.4rem 0;
    border-radius: 999px;
  }
  .seg-btn.active { background: var(--accent); color: #fff; }
  .tags { display: flex; gap: 0.35rem; }
  .tag {
    font-size: 10.5px;
    font-weight: 600;
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
    background: var(--surface-2);
    color: var(--muted);
  }
  .tag.ok { background: var(--ok-soft); color: var(--ok); }
  .tag.warn { background: var(--warn-soft); color: var(--warn); }
  .dim { color: var(--faint); }
  .mini { background: var(--surface-2); color: var(--text); font-size: 12px; padding: 0.25rem 0.8rem; }
  .danger { background: var(--bad-soft); color: var(--bad); align-self: flex-start; }
</style>
