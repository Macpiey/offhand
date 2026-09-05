<script lang="ts">
  import { goto } from '$app/navigation';
  import { sessions, workspaces, runners, waiting, currentSessionId } from '$lib/stores.js';
  import { send } from '$lib/client.js';

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
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }
</script>

<div class="page">
  <h1>Your sessions</h1>

  {#if $waiting.size > 0}
    <button class="waiting" onclick={() => openSession([...$waiting][0]!)}>
      <span class="lock">🔐</span>
      <span>
        <strong>{$waiting.size === 1 ? 'An approval is' : `${$waiting.size} approvals are`} waiting</strong>
        <small>your agent is paused until you decide</small>
      </span>
      <span class="chev">›</span>
    </button>
  {/if}

  <div class="list">
    {#each live as s (s.id)}
      <div
        class="card"
        class:attention={$waiting.has(s.id)}
        onclick={() => openSession(s.id)}
        onkeydown={(e) => e.key === 'Enter' && openSession(s.id)}
        role="button"
        tabindex="0"
      >
        <div class="top">
          <span class="label">{s.label}</span>
          {#if $waiting.has(s.id)}
            <span class="pill warn">needs you</span>
          {:else if s.busy}
            <span class="pill busy"><span class="pulse"></span>working</span>
          {:else if s.queuedPrompts > 0}
            <span class="pill">{s.queuedPrompts} queued</span>
          {/if}
        </div>
        <div class="sub">
          {$runners.find((r) => r.id === s.runnerId)?.name ?? s.runnerId}
          {#if s.model}· {s.model}{/if}
          · {timeAgo(s.createdAtMs)}
        </div>
        <button class="archive" onclick={(e) => archive(s.id, e)} aria-label="Archive">✕</button>
      </div>
    {:else}
      <div class="empty">
        <p class="empty-title">Nothing here yet</p>
        <p class="empty-sub">Create a session to start driving your agent.</p>
      </div>
    {/each}
  </div>

  {#if showNew}
    <div class="sheet">
      <h2>New session</h2>
      <label>Workspace
        <select bind:value={newWorkspace}>
          <option value="" disabled selected>Choose a project…</option>
          {#each $workspaces as w (w.path)}<option value={w.path}>{w.label}</option>{/each}
        </select>
      </label>
      <label>Agent
        <select bind:value={newRunner}>
          <option value="" disabled selected>Choose an agent…</option>
          {#each $runners.filter((r) => r.available) as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
        </select>
      </label>
      <label>Name <span class="opt">(optional)</span>
        <input placeholder="e.g. checkout bugfix" bind:value={newLabel} />
      </label>
      <div class="sheet-actions">
        <button onclick={createSession} disabled={!newWorkspace || !newRunner}>Create session</button>
        <button class="ghost" onclick={() => (showNew = false)}>Cancel</button>
      </div>
    </div>
  {:else}
    <button class="fab" onclick={() => (showNew = true)}>＋ New session</button>
  {/if}
</div>

<style>
  .page { padding: 0.5rem 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  h1 {
    font: 600 26px/1.2 var(--font-display);
    letter-spacing: -0.02em;
    margin: 0.5rem 0 0.25rem;
  }
  .waiting {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    width: 100%;
    text-align: left;
    background: var(--warn-soft);
    border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent);
    color: var(--text);
    border-radius: var(--radius);
    padding: 0.85rem 1.1rem;
  }
  .waiting .lock { font-size: 20px; }
  .waiting span { display: flex; flex-direction: column; }
  .waiting small { color: var(--muted); font-weight: 400; }
  .waiting .chev { margin-left: auto; font-size: 22px; color: var(--muted); }

  .list { display: flex; flex-direction: column; gap: 0.7rem; }
  .card {
    position: relative;
    background: var(--surface);
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 1rem 1.15rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .card:hover { background: var(--surface-2); }
  .card.attention { border-color: color-mix(in srgb, var(--warn) 50%, transparent); }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding-right: 1.5rem; }
  .label { font-weight: 600; font-size: 16px; }
  .sub { color: var(--muted); font-size: 13px; margin-top: 0.2rem; }
  .pill {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface-2);
    border-radius: 999px;
    padding: 0.15rem 0.65rem;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .pill.warn { background: var(--warn-soft); color: var(--warn); }
  .pill.busy { background: var(--accent-soft); color: var(--accent); }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1.3s infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .archive {
    position: absolute;
    top: 0.7rem;
    right: 0.7rem;
    background: none;
    color: var(--faint);
    padding: 0.15rem 0.35rem;
    font-size: 12px;
  }
  .empty { text-align: center; padding: 3rem 1rem; }
  .empty-title { font: 600 19px/1.3 var(--font-display); margin: 0; }
  .empty-sub { color: var(--muted); margin: 0.35rem 0 0; }

  .sheet {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 1.15rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .sheet h2 { font: 600 18px/1.2 var(--font-display); margin: 0; }
  label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 13px; font-weight: 600; color: var(--muted); }
  .opt { font-weight: 400; }
  .sheet-actions { display: flex; gap: 0.6rem; padding-top: 0.25rem; }
  .ghost { background: var(--surface-2); color: var(--muted); }
  .fab { align-self: center; padding: 0.75rem 1.75rem; font-size: 15px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3); }
</style>
