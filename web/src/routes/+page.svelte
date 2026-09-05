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
</script>

{#if $waiting.size > 0}
  <button class="waiting-banner" onclick={() => openSession([...$waiting][0]!)}>
    🔐 {$waiting.size} approval{$waiting.size > 1 ? 's' : ''} waiting on you — tap to review
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
      <div class="row">
        <span class="label">{s.label}</span>
        <span class="state">
          {#if $waiting.has(s.id)}🔐 waiting
          {:else if s.busy}<span class="spin">●</span> running
          {:else if s.queuedPrompts > 0}{s.queuedPrompts} queued
          {:else}idle{/if}
        </span>
      </div>
      <div class="meta">
        <span class="chip">{$runners.find((r) => r.id === s.runnerId)?.name ?? s.runnerId}</span>
        {#if s.model}<span class="chip">{s.model}</span>{/if}
        <span class="path">{s.workspace}</span>
        <button class="archive" onclick={(e) => archive(s.id, e)} title="Archive">✕</button>
      </div>
    </div>
  {:else}
    <p class="empty">No sessions yet — create one below.</p>
  {/each}

  {#if showNew}
    <div class="card new">
      <select bind:value={newWorkspace}>
        <option value="" disabled selected>Workspace…</option>
        {#each $workspaces as w (w.path)}<option value={w.path}>{w.label} ({w.path})</option>{/each}
      </select>
      <select bind:value={newRunner}>
        <option value="" disabled selected>Agent…</option>
        {#each $runners.filter((r) => r.available) as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
      <input placeholder="Label (optional)" bind:value={newLabel} />
      <div class="row">
        <button onclick={createSession} disabled={!newWorkspace || !newRunner}>Create</button>
        <button class="ghost" onclick={() => (showNew = false)}>Cancel</button>
      </div>
    </div>
  {:else}
    <button class="new-btn" onclick={() => (showNew = true)}>＋ New session</button>
  {/if}
</div>

<style>
  .list { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .waiting-banner {
    margin: 0.75rem 1rem 0;
    background: #b62324;
    text-align: left;
  }
  .card {
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 0.75rem 1rem;
    cursor: pointer;
    background: #11161d;
  }
  .card.attention { border-color: #d29922; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .label { font-weight: 600; }
  .state { font-size: 12px; color: #8b949e; white-space: nowrap; }
  .spin { color: #58a6ff; animation: pulse 1.2s infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  .meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.4rem; font-size: 11px; color: #8b949e; }
  .chip { border: 1px solid #30363d; border-radius: 999px; padding: 0 0.5rem; white-space: nowrap; }
  .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .archive { background: none; color: #8b949e; padding: 0 0.25rem; }
  .empty { color: #8b949e; text-align: center; padding: 2rem 0; }
  .card.new { display: flex; flex-direction: column; gap: 0.5rem; }
  .new-btn { background: #1f6feb; }
  .ghost { background: #21262d; }
</style>
