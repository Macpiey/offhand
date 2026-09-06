<script lang="ts">
  import { conn, workspaces, runners, sessions } from '$lib/stores.js';
  import { send, unpair, loadPairing, DEFAULT_RELAY_URL } from '$lib/client.js';
  import { requestPushPermission, pushGranted } from '$lib/push.js';
  import { sessionIdFromDaemonKey, fromB64u, type ApprovalPolicy } from '@offhand/shared';
  import Icon from '$lib/components/Icon.svelte';

  const POLICIES: { id: ApprovalPolicy; label: string; hint: string }[] = [
    { id: 'paranoid', label: 'Paranoid', hint: 'Ask for everything the agent would ask.' },
    { id: 'balanced', label: 'Balanced', hint: 'Ask for writes and commands. The default.' },
    { id: 'trusting', label: 'Trusting', hint: 'Auto-approve low-risk. Ask only for high-risk actions.' },
  ];

  let pushOn = $state(pushGranted());
  let showAllAgents = $state(false);
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

  const archived = $derived($sessions.filter((s) => s.archived));
  const installedAgents = $derived($runners.filter((r) => r.available));
  const missingAgents = $derived($runners.filter((r) => !r.available));
</script>

<div class="page">
  <section>
    <h2>Device</h2>
    <div class="card">
      <div class="row">
        <span class="k">Computer</span>
        <span class="v">{$conn.host ? `${$conn.host.hostname} · v${$conn.host.daemonVersion}` : 'Offline'}</span>
      </div>
      <div class="hr"></div>
      <div class="row">
        <span class="k">Encryption</span>
        <span class="v sas">{$conn.sas || '—'}</span>
      </div>
      <div class="hr"></div>
      <div class="row">
        <span class="k">Notifications</span>
        {#if isIOS && !isStandalone}
          <span class="v dim">Install app first</span>
        {:else}
          <button
            class="toggle"
            class:on={pushOn}
            onclick={enablePush}
            disabled={pushOn}
            aria-label="Enable notifications"
          ><span class="knob"></span></button>
        {/if}
      </div>
      {#if isIOS && !isStandalone}
        <p class="hint">Share → <strong>Add to Home Screen</strong>, then enable notifications from the installed app.</p>
      {/if}
    </div>
  </section>

  <section>
    <h2>Workspaces</h2>
    {#each $workspaces as w (w.path)}
      <div class="card">
        <div class="ws-head">
          <span class="ws-name">{w.label}</span>
          {#if w.gitBranch}<span class="branch">{w.gitBranch}{w.dirty ? ' ±' : ''}</span>{/if}
        </div>
        <div class="seg">
          {#each POLICIES as p (p.id)}
            <button
              class="seg-btn"
              class:active={w.policy === p.id}
              onclick={() => send({ type: 'policy-set', workspace: w.path, policy: p.id })}
            >{p.label}</button>
          {/each}
        </div>
        <p class="hint">{POLICIES.find((p) => p.id === w.policy)?.hint}</p>
        {#if w.devUrl}<p class="hint mono">Screenshots: {w.devUrl}</p>{/if}
      </div>
    {/each}
  </section>

  <section>
    <h2>Agents</h2>
    <div class="card">
      {#each installedAgents as r, i (r.id)}
        {#if i > 0}<div class="hr"></div>{/if}
        <div class="row">
          <span class="k ink">{r.name}</span>
          <span class="tags">
            {#if r.loggedIn === false}<span class="tag warn">Signed out</span>{/if}
            {#if !r.supportsApprovals}<span class="tag warn">Unguarded</span>{/if}
            <span class="tag ok">Ready</span>
          </span>
        </div>
      {/each}
      {#if missingAgents.length > 0}
        <div class="hr"></div>
        {#if showAllAgents}
          {#each missingAgents as r, i (r.id)}
            {#if i > 0}<div class="hr"></div>{/if}
            <div class="row"><span class="k">{r.name}</span><span class="tag">Not installed</span></div>
          {/each}
        {:else}
          <button class="more" onclick={() => (showAllAgents = true)}>
            + {missingAgents.length} more supported
          </button>
        {/if}
      {/if}
    </div>
  </section>

  {#if archived.length > 0}
    <section>
      <h2>Archived sessions</h2>
      <div class="card">
        {#each archived as s, i (s.id)}
          {#if i > 0}<div class="hr"></div>{/if}
          <div class="row">
            <span class="k">{s.label}</span>
            <button class="mini" onclick={() => send({ type: 'session-update', sessionId: s.id, archived: false })}>Restore</button>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section>
    <h2>About</h2>
    <div class="card">
      <div class="row"><span class="k">Version</span><span class="v dim">beta</span></div>
      <div class="hr"></div>
      <button
        class="destructive"
        onclick={() => confirm('Unpair this device? You will need to scan a new code.') && unpair()}
      ><Icon name="x" size={14} />Unpair this device</button>
    </div>
  </section>
</div>

<style>
  .page { padding: 0.4rem 1.25rem calc(var(--inset-b) + 1rem); display: flex; flex-direction: column; gap: 1.25rem; }
  h2 {
    font-size: 11px;
    font-weight: 700;
    color: var(--ghost);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin: 0 0 0.5rem 0.2rem;
  }
  section { display: flex; flex-direction: column; }
  .card {
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    padding: 0.4rem 1.05rem;
    display: flex;
    flex-direction: column;
  }
  .card + .card { margin-top: 0.55rem; }
  .hr { height: 1px; background: var(--hairline); margin: 0 -1.05rem; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-size: 14px; min-height: 46px; }
  .k { color: var(--mute); }
  .k.ink { color: var(--ink); font-weight: 500; }
  .v { font-weight: 500; text-align: right; }
  .v.dim { color: var(--ghost); font-weight: 400; }
  .sas { color: var(--ok); font-family: var(--mono); font-size: 12.5px; }
  .hint { color: var(--ghost); font-size: 12.5px; margin: 0.15rem 0 0.6rem; line-height: 1.5; }
  .hint.mono { font-family: var(--mono); font-size: 11.5px; }

  .toggle {
    width: 46px;
    height: 28px;
    border-radius: 14px;
    background: var(--raised);
    border: 1px solid var(--hairline-2);
    padding: 2px;
    justify-content: flex-start;
  }
  .toggle.on { background: var(--ok); border-color: var(--ok); justify-content: flex-end; opacity: 1; }
  .toggle:disabled { pointer-events: none; }
  .knob { width: 22px; height: 22px; border-radius: 50%; background: #fff; }

  .ws-head { display: flex; align-items: baseline; gap: 0.55rem; padding: 0.65rem 0 0.55rem; }
  .ws-name { font-weight: 600; font-size: 14.5px; }
  .branch { color: var(--ghost); font-family: var(--mono); font-size: 11.5px; }
  .seg {
    display: flex;
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: var(--r-ctl);
    padding: 3px;
    margin-bottom: 0.15rem;
  }
  .seg-btn {
    flex: 1;
    height: 32px;
    background: transparent;
    color: var(--mute);
    font-size: 12.5px;
    border-radius: 7px;
  }
  .seg-btn:active { background: transparent; }
  .seg-btn.active { background: var(--raised); color: var(--ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }

  .tags { display: flex; gap: 0.35rem; }
  .tag {
    font-size: 10.5px;
    font-weight: 600;
    border-radius: 999px;
    padding: 0.18rem 0.55rem;
    background: var(--raised);
    color: var(--mute);
  }
  .tag.ok { background: var(--ok-soft); color: var(--ok); }
  .tag.warn { background: var(--warn-soft); color: var(--warn); }
  .more {
    background: none;
    color: var(--ghost);
    height: 42px;
    justify-content: flex-start;
    font-weight: 500;
    font-size: 13px;
  }
  .more:active { background: none; }
  .mini { height: 28px; background: var(--raised); color: var(--ink); font-size: 12px; padding: 0 0.75rem; }
  .destructive {
    background: none;
    color: var(--risk);
    height: 46px;
    justify-content: flex-start;
    padding: 0;
    font-weight: 600;
  }
  .destructive:active { background: none; }
</style>

