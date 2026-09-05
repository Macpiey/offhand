<script lang="ts">
  import { conn, workspaces, runners, sessions } from '$lib/stores.js';
  import { send, unpair, loadPairing, DEFAULT_RELAY_URL } from '$lib/client.js';
  import { requestPushPermission, pushGranted } from '$lib/push.js';
  import { sessionIdFromDaemonKey, fromB64u, type ApprovalPolicy } from '@offhand/shared';

  const POLICIES: { id: ApprovalPolicy; label: string; hint: string }[] = [
    { id: 'paranoid', label: 'Paranoid', hint: 'ask for everything the agent would ask' },
    { id: 'balanced', label: 'Balanced', hint: 'ask for writes and commands (default)' },
    { id: 'trusting', label: 'Trusting', hint: 'auto-approve low-risk, ask only high-risk' },
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

  function unarchive(id: string): void {
    send({ type: 'session-update', sessionId: id, archived: false });
  }
</script>

<div class="settings">
  <section>
    <h2>Connection</h2>
    <dl>
      <dt>E2E fingerprint (must match daemon)</dt>
      <dd class="sas">🔒 {$conn.sas || '—'}</dd>
      <dt>Daemon</dt>
      <dd>{$conn.host ? `${$conn.host.hostname} (${$conn.host.os}) · v${$conn.host.daemonVersion}` : 'offline'}</dd>
      <dt>Relay</dt>
      <dd>{pairing?.relayUrl ?? '—'}</dd>
    </dl>
  </section>

  <section>
    <h2>Notifications</h2>
    {#if isIOS && !isStandalone}
      <p class="hint">📲 Install first: Share → Add to Home Screen — iOS only delivers push to installed apps.</p>
    {:else if pushOn}
      <p class="hint ok">✔ approval notifications enabled</p>
    {:else}
      <button onclick={enablePush}>🔔 Enable approval notifications</button>
    {/if}
  </section>

  <section>
    <h2>Approval policy</h2>
    {#each $workspaces as w (w.path)}
      <div class="ws">
        <div class="ws-head">{w.label} <span class="path">{w.path}</span></div>
        <div class="policies">
          {#each POLICIES as p (p.id)}
            <button
              class="policy"
              class:active={w.policy === p.id}
              onclick={() => setPolicy(w.path, p.id)}
              title={p.hint}
            >{p.label}</button>
          {/each}
        </div>
        <p class="hint">{POLICIES.find((p) => p.id === w.policy)?.hint}</p>
      </div>
    {/each}
  </section>

  <section>
    <h2>Agents on this daemon</h2>
    {#each $runners as r (r.id)}
      <div class="runner">
        <span class:dim={!r.available}>{r.name}</span>
        <span class="tags">
          {#if !r.available}<span class="tag">not installed</span>
          {:else}
            {#if r.loggedIn === false}<span class="tag warn">not logged in</span>{/if}
            {#if !r.supportsApprovals}<span class="tag warn">no approval gates</span>{/if}
            {#if r.available}<span class="tag ok">ready</span>{/if}
          {/if}
        </span>
      </div>
    {/each}
  </section>

  {#if archived.length > 0}
    <section>
      <h2>Archived sessions</h2>
      {#each archived as s (s.id)}
        <div class="runner">
          <span class="dim">{s.label}</span>
          <button class="small" onclick={() => unarchive(s.id)}>restore</button>
        </div>
      {/each}
    </section>
  {/if}

  <section>
    <h2>Danger zone</h2>
    <button
      class="danger"
      onclick={() => confirm('Unpair this device? You will need to re-scan a pairing code.') && unpair()}
    >Unpair this device</button>
  </section>
</div>

<style>
  .settings { padding: 1rem; display: flex; flex-direction: column; gap: 1.25rem; }
  h2 { font-size: 13px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.5rem; }
  dl { margin: 0; font-size: 13px; }
  dt { color: #8b949e; margin-top: 0.5rem; font-size: 11px; }
  dd { margin: 0; word-break: break-all; }
  .sas { color: #3fb950; }
  .hint { color: #8b949e; font-size: 12px; margin: 0.25rem 0 0; }
  .hint.ok { color: #3fb950; }
  .ws { border: 1px solid #21262d; border-radius: 10px; padding: 0.6rem 0.8rem; margin-bottom: 0.5rem; }
  .ws-head { font-size: 13px; margin-bottom: 0.5rem; }
  .path { color: #8b949e; font-size: 11px; }
  .policies { display: flex; gap: 0.4rem; }
  .policy { background: #21262d; color: #8b949e; font-size: 12px; padding: 0.35rem 0.8rem; }
  .policy.active { background: #1f6feb; color: #fff; }
  .runner { display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0; font-size: 13px; }
  .dim { color: #8b949e; }
  .tags { display: flex; gap: 0.3rem; }
  .tag { border: 1px solid #30363d; border-radius: 999px; padding: 0 0.5rem; font-size: 10px; color: #8b949e; }
  .tag.ok { border-color: #238636; color: #3fb950; }
  .tag.warn { border-color: #d29922; color: #d29922; }
  .small { padding: 0.2rem 0.6rem; font-size: 11px; background: #21262d; }
  .danger { background: #b62324; }
</style>
