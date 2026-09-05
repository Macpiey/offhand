<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { sessions, transcripts, runners, waiting, currentSessionId } from '$lib/stores.js';
  import { send } from '$lib/client.js';
  import Icon from './Icon.svelte';

  const live = $derived($sessions.filter((s) => !s.archived));

  function openSession(id: string): void {
    currentSessionId.set(id);
    void goto('/session');
  }

  /** Last receipt / waiting line for the card's second row. */
  function subline(id: string): { icon: string; cls: string; text: string } {
    if ($waiting.has(id)) {
      const items = $transcripts.get(id) ?? [];
      const a = [...items].reverse().find((i) => i.kind === 'approval' && i.resolved === null);
      return {
        icon: 'lock',
        cls: 'warn',
        text: a && a.kind === 'approval' ? `Waiting: ${a.action}` : 'Waiting for approval',
      };
    }
    const s = live.find((x) => x.id === id);
    if (s?.busy) {
      const items = $transcripts.get(id) ?? [];
      const p = [...items].reverse().find((i) => i.kind === 'prompt');
      return { icon: 'terminal', cls: 'busy', text: p && p.kind === 'prompt' ? `“${p.text.slice(0, 42)}${p.text.length > 42 ? '…' : ''}”` : 'Working' };
    }
    const items = $transcripts.get(id) ?? [];
    const r = [...items].reverse().find((i) => i.kind === 'receipt');
    if (r && r.kind === 'receipt') {
      const rc = r.receipt;
      return {
        icon: rc.ok ? 'check' : 'x',
        cls: rc.ok ? 'ok' : 'bad',
        text: rc.filesChanged > 0 ? `${rc.filesChanged} file${rc.filesChanged > 1 ? 's' : ''} +${rc.additions} −${rc.deletions}` : rc.ok ? 'Completed' : 'Failed',
      };
    }
    return { icon: 'chat', cls: '', text: 'No activity yet' };
  }

  function timeAgo(ms: number): string {
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.round(hrs / 24)}d`;
  }

  // Long-press → archive action sheet (simple confirm for v1)
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  function pressStart(id: string): void {
    pressTimer = setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate?.(15);
      if (confirm('Archive this session?')) send({ type: 'session-update', sessionId: id, archived: true });
    }, 550);
  }
  function pressEnd(): void {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  const sorted = $derived(
    [...live].sort((a, b) => {
      const wa = $waiting.has(a.id) ? 0 : a.busy ? 1 : 2;
      const wb = $waiting.has(b.id) ? 0 : b.busy ? 1 : 2;
      return wa - wb || b.createdAtMs - a.createdAtMs;
    }),
  );
</script>

<div class="list">
  {#each sorted as s (s.id)}
    {@const sub = subline(s.id)}
    <div
      class="card"
      class:attention={$waiting.has(s.id)}
      class:current={$page.url.pathname === '/session' && $currentSessionId === s.id}
      onclick={() => openSession(s.id)}
      onkeydown={(e) => e.key === 'Enter' && openSession(s.id)}
      onpointerdown={() => pressStart(s.id)}
      onpointerup={pressEnd}
      onpointerleave={pressEnd}
      role="button"
      tabindex="0"
    >
      <div class="top">
        <span class="label">{s.label}</span>
        <span class="when">{timeAgo(s.createdAtMs)}</span>
      </div>
      <div class="sub {sub.cls}">
        {#if s.busy && !$waiting.has(s.id)}<span class="pulse"></span>{:else}<Icon name={sub.icon} size={12} />{/if}
        <span class="sub-text">{sub.text}</span>
        <span class="agent">{$runners.find((r) => r.id === s.runnerId)?.name ?? s.runnerId}</span>
      </div>
    </div>
  {:else}
    <div class="empty">
      <div class="empty-icon"><Icon name="chat" size={20} /></div>
      <p class="t">No sessions yet</p>
      <p class="s">Create one to start driving your agent.</p>
    </div>
  {/each}
</div>

<style>
  .list { display: flex; flex-direction: column; gap: 0.55rem; }
  .card {
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    padding: 0.8rem 1rem;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .card:hover { background: var(--raised); }
  .card.attention { border-color: color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn-soft) 55%, var(--card)); }
  .card.current { border-color: var(--hairline-2); background: var(--raised); }
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; }
  .label { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { color: var(--ghost); font-size: 11.5px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .sub {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.3rem;
    font-size: 12.5px;
    color: var(--mute);
  }
  .sub.warn { color: var(--warn); }
  .sub.busy { color: var(--brand); }
  .sub.ok :global(svg) { color: var(--ok); }
  .sub.bad :global(svg) { color: var(--risk); }
  .sub-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .agent { color: var(--ghost); font-size: 11px; flex-shrink: 0; }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1.3s infinite; flex-shrink: 0; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .empty { text-align: center; padding: 2.5rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
  .empty-icon {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--card);
    border: 1px solid var(--hairline);
    color: var(--mute);
    display: grid;
    place-items: center;
    margin-bottom: 0.35rem;
  }
  .t { font-weight: 600; font-size: 15px; margin: 0; }
  .s { color: var(--mute); margin: 0; font-size: 13px; }
</style>
