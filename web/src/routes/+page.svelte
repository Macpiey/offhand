<script lang="ts">
  import { sessions, waiting, workspaces, runners } from '$lib/stores.js';
  import { send } from '$lib/client.js';
  import { portal } from '$lib/portal.js';
  import SessionList from '$lib/components/SessionList.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let showNew = $state(false);
  let newWorkspace = $state('');
  let newRunner = $state('');
  let newModel = $state('');
  let newLabel = $state('');

  const live = $derived($sessions.filter((s) => !s.archived));
  const working = $derived(live.filter((s) => s.busy).length);

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    return h < 5 ? 'Up late.' : h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.';
  });
  const statusLine = $derived.by(() => {
    if ($waiting.size > 0) return `${$waiting.size} thing${$waiting.size > 1 ? 's' : ''} need${$waiting.size > 1 ? '' : 's'} you.`;
    if (working > 0) return `${working} agent${working > 1 ? 's' : ''} working.`;
    return 'All quiet.';
  });

  const selectedRunner = $derived($runners.find((r) => r.id === newRunner));

  function createSession(): void {
    if (!newWorkspace || !newRunner) return;
    send({
      type: 'session-create',
      workspace: newWorkspace,
      runnerId: newRunner,
      ...(newModel ? { model: newModel } : {}),
      ...(newLabel.trim() ? { label: newLabel.trim() } : {}),
    });
    showNew = false;
    newLabel = '';
    newModel = '';
  }
</script>

<div class="page">
  <div class="hero">
    <h1>{greeting}</h1>
    <p class="status" class:hot={$waiting.size > 0}>{statusLine}</p>
  </div>

  <SessionList />

  <button class="new" onclick={() => (showNew = true)}><Icon name="plus" size={16} />New session</button>
</div>

{#if showNew}
  <div class="overlay" use:portal onclick={() => (showNew = false)} onkeydown={(e) => e.key === 'Escape' && (showNew = false)} role="presentation">
    <div class="sheet" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="New session" tabindex="-1" onkeydown={() => {}}>
      <div class="handle"></div>
      <h2>New session</h2>

      <span class="group">Workspace</span>
      <div class="opts">
        {#each $workspaces as w (w.path)}
          <button class="opt" class:sel={newWorkspace === w.path} onclick={() => (newWorkspace = w.path)}>
            <span class="radio" class:on={newWorkspace === w.path}></span>
            <span class="opt-label">{w.label}</span>
            {#if w.gitBranch}<span class="opt-meta">{w.gitBranch}</span>{/if}
          </button>
        {/each}
      </div>

      <span class="group">Agent</span>
      <div class="opts">
        {#each $runners.filter((r) => r.available) as r (r.id)}
          <button class="opt" class:sel={newRunner === r.id} onclick={() => { newRunner = r.id; newModel = ''; }}>
            <span class="radio" class:on={newRunner === r.id}></span>
            <span class="opt-label">{r.name}</span>
            {#if !r.supportsApprovals}<span class="opt-meta warn">unguarded</span>
            {:else}<span class="opt-meta ok">ready</span>{/if}
          </button>
        {/each}
      </div>

      {#if selectedRunner && selectedRunner.models.length > 0}
        <span class="group">Model</span>
        <select bind:value={newModel}>
          <option value="">Default</option>
          {#each selectedRunner.models as m (m)}<option value={m}>{m}</option>{/each}
        </select>
      {/if}

      <input placeholder="Name · optional" bind:value={newLabel} />

      <button class="create" onclick={createSession} disabled={!newWorkspace || !newRunner}>Start session</button>
    </div>
  </div>
{/if}

<style>
  .page { flex: 1; padding: 0.4rem 1.25rem 1rem; display: flex; flex-direction: column; gap: 1rem; }
  .hero { margin-top: 0.3rem; }
  h1 { font: 700 26px/1.2 var(--serif); letter-spacing: -0.02em; margin: 0; }
  .status { color: var(--mute); margin: 0.2rem 0 0; font-size: 15px; }
  .status.hot { color: var(--warn); font-weight: 600; }
  .new { margin-top: auto; align-self: stretch; height: 50px; font-size: 15px; border-radius: 14px; }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .sheet {
    width: 100%;
    max-width: 560px;
    max-height: 86dvh;
    overflow-y: auto;
    background: var(--card);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    padding: 0.55rem 1.4rem calc(var(--inset-b) + 1rem);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    animation: rise 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @keyframes rise { from { transform: translateY(48px); opacity: 0.4; } }
  .handle { width: 36px; height: 4px; border-radius: 2px; background: var(--hairline-2); align-self: center; }
  h2 { font: 600 17px/1.2 var(--font); margin: 0.3rem 0 0.2rem; }
  .group {
    font-size: 11px;
    font-weight: 700;
    color: var(--ghost);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-top: 0.3rem;
  }
  .opts { display: flex; flex-direction: column; gap: 0.4rem; }
  .opt {
    justify-content: flex-start;
    height: 46px;
    background: var(--bg);
    border: 1px solid var(--hairline);
    color: var(--ink);
    font-weight: 500;
    gap: 0.7rem;
    padding: 0 0.9rem;
  }
  .opt:active { background: var(--bg); }
  .opt.sel { border-color: var(--brand); }
  .radio {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid var(--ghost);
    flex-shrink: 0;
  }
  .radio.on { border-color: var(--brand); background: radial-gradient(circle, var(--brand) 45%, transparent 50%); }
  .opt-label { flex: 1; text-align: left; }
  .opt-meta { font-size: 11px; color: var(--ghost); font-family: var(--mono); }
  .opt-meta.ok { color: var(--ok); font-family: var(--font); font-weight: 600; }
  .opt-meta.warn { color: var(--warn); font-family: var(--font); font-weight: 600; }
  .create { margin-top: 0.4rem; height: 48px; font-size: 15px; }
</style>
