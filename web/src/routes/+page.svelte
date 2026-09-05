<script lang="ts">
  import { goto } from '$app/navigation';
  import { sessions, workspaces, runners, waiting, currentSessionId } from '$lib/stores.js';
  import { send } from '$lib/client.js';
  import Icon from '$lib/components/Icon.svelte';

  let showNew = $state(false);
  let newWorkspace = $state('');
  let newRunner = $state('');
  let newLabel = $state('');

  const live = $derived($sessions.filter((s) => !s.archived));

  function openSession(id: string): void {
    currentSessionId.set(id);
    void goto('/session');
  }

  function createSession(): void {
    if (!newWorkspace || !newRunner) return;
    send({
      type: 'session-create',
      workspace: newWorkspace,
      runnerId: newRunner,
      ...(newLabel.trim() ? { label: newLabel.trim() } : {}),
    });
    showNew = false;
    newLabel = '';
  }

  function archive(id: string, e: Event): void {
    e.stopPropagation();
    if (confirm('Archive this session?')) send({ type: 'session-update', sessionId: id, archived: true });
  }

  function timeAgo(ms: number): string {
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.round(hrs / 24)}d`;
  }
</script>

<div class="page">
  <div class="page-head">
    <h1>Sessions</h1>
    <button class="new" onclick={() => (showNew = true)}><Icon name="plus" size={16} />New</button>
  </div>

  {#if $waiting.size > 0}
    <button class="waiting" onclick={() => openSession([...$waiting][0]!)}>
      <span class="waiting-icon"><Icon name="lock" size={17} /></span>
      <span class="waiting-text">
        <strong>{$waiting.size === 1 ? 'Approval needed' : `${$waiting.size} approvals needed`}</strong>
        <small>Your agent is paused until you decide</small>
      </span>
      <Icon name="chevron-right" size={17} />
    </button>
  {/if}

  <div class="list">
    {#each live as s (s.id)}
      <div
        class="card"
        onclick={() => openSession(s.id)}
        onkeydown={(e) => e.key === 'Enter' && openSession(s.id)}
        role="button"
        tabindex="0"
      >
        <div class="card-main">
          <div class="top">
            <span class="label">{s.label}</span>
            {#if $waiting.has(s.id)}
              <span class="pill warn">Needs you</span>
            {:else if s.busy}
              <span class="pill busy"><span class="pulse"></span>Working</span>
            {:else if s.queuedPrompts > 0}
              <span class="pill">{s.queuedPrompts} queued</span>
            {/if}
          </div>
          <div class="sub">
            {$runners.find((r) => r.id === s.runnerId)?.name ?? s.runnerId}{s.model ? ` · ${s.model}` : ''} · {timeAgo(s.createdAtMs)}
          </div>
        </div>
        <button class="icon-btn" onclick={(e) => archive(s.id, e)} aria-label="Archive session">
          <Icon name="archive" size={16} />
        </button>
      </div>
    {:else}
      <div class="empty">
        <div class="empty-icon"><Icon name="chat" size={22} /></div>
        <p class="empty-title">No sessions yet</p>
        <p class="empty-sub">Create one to start driving your agent from here.</p>
      </div>
    {/each}
  </div>
</div>

{#if showNew}
  <div class="overlay" onclick={() => (showNew = false)} onkeydown={(e) => e.key === 'Escape' && (showNew = false)} role="presentation">
    <div class="sheet" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="New session" tabindex="-1" onkeydown={() => {}}>
      <div class="sheet-handle"></div>
      <h2>New session</h2>
      <label>Workspace
        <select bind:value={newWorkspace}>
          <option value="" disabled selected>Choose a project</option>
          {#each $workspaces as w (w.path)}<option value={w.path}>{w.label}</option>{/each}
        </select>
      </label>
      <label>Agent
        <select bind:value={newRunner}>
          <option value="" disabled selected>Choose an agent</option>
          {#each $runners.filter((r) => r.available) as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
        </select>
      </label>
      <label>Name <span class="opt">optional</span>
        <input placeholder="e.g. Checkout bugfix" bind:value={newLabel} />
      </label>
      <div class="sheet-actions">
        <button class="ghost" onclick={() => (showNew = false)}>Cancel</button>
        <button onclick={createSession} disabled={!newWorkspace || !newRunner}>Create</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page { padding: 0.4rem 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .page-head { display: flex; align-items: center; justify-content: space-between; margin-top: 0.4rem; }
  h1 { font: 700 22px/1.2 var(--font-body); letter-spacing: -0.02em; margin: 0; }
  .new { height: 36px; padding: 0 0.9rem; font-size: 13.5px; }

  .waiting {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    width: 100%;
    height: auto;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--hairline-strong);
    color: var(--text);
    border-radius: var(--r-lg);
    padding: 0.8rem 1rem;
  }
  .waiting:hover { background: var(--surface-2); }
  .waiting-icon {
    width: 34px;
    height: 34px;
    border-radius: var(--r-md);
    background: var(--warn-soft);
    color: var(--warn);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .waiting-text { display: flex; flex-direction: column; flex: 1; gap: 1px; }
  .waiting-text strong { font-size: 14.5px; }
  .waiting-text small { color: var(--muted); font-weight: 400; font-size: 12.5px; }

  .list { display: flex; flex-direction: column; gap: 0.6rem; }
  .card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 0.85rem 0.7rem 0.85rem 1.05rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .card:hover { background: var(--surface-2); border-color: var(--hairline-strong); }
  .card-main { flex: 1; min-width: 0; }
  .top { display: flex; align-items: center; gap: 0.6rem; }
  .label { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { color: var(--muted); font-size: 12.5px; margin-top: 0.15rem; }
  .pill {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface-2);
    border-radius: 999px;
    padding: 0.18rem 0.6rem;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .pill.warn { background: var(--warn-soft); color: var(--warn); }
  .pill.busy { background: var(--accent-soft); color: var(--accent-hover); }
  .pulse { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: pulse 1.3s infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .icon-btn {
    width: 34px;
    height: 34px;
    padding: 0;
    background: transparent;
    color: var(--faint);
    border-radius: var(--r-sm);
    flex-shrink: 0;
  }
  .icon-btn:hover { background: var(--surface-2); color: var(--muted); }

  .empty { text-align: center; padding: 3.5rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .empty-icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--hairline);
    color: var(--muted);
    display: grid;
    place-items: center;
    margin-bottom: 0.4rem;
  }
  .empty-title { font-weight: 600; font-size: 15.5px; margin: 0; }
  .empty-sub { color: var(--muted); margin: 0; font-size: 13.5px; }

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
    background: var(--surface);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    padding: 0.6rem 1.4rem calc(1.4rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    animation: rise 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @keyframes rise { from { transform: translateY(40px); opacity: 0.5; } }
  .sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--hairline-strong);
    align-self: center;
  }
  h2 { font: 600 17px/1.2 var(--font-body); margin: 0.2rem 0 0; }
  label { display: flex; flex-direction: column; gap: 0.4rem; font-size: 12.5px; font-weight: 600; color: var(--muted); }
  .opt { font-weight: 400; color: var(--faint); }
  .sheet-actions { display: flex; gap: 0.6rem; justify-content: flex-end; padding-top: 0.35rem; }
  .ghost { background: var(--surface-2); color: var(--text); }
  .ghost:hover { background: var(--surface-2); opacity: 0.85; }
</style>
