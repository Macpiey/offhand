<script lang="ts">
  import { tick } from 'svelte';
  import { sessions, transcripts, currentSessionId, runners, workspaces, type TranscriptItem } from '$lib/stores.js';
  import { send, ensureHistory } from '$lib/client.js';
  import { renderMarkdown } from '$lib/markdown.js';
  import ReceiptCard from '$lib/components/ReceiptCard.svelte';
  import Composer from '$lib/components/Composer.svelte';
  import ApprovalSheet from '$lib/components/ApprovalSheet.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let scroller = $state<HTMLElement | null>(null);
  let atBottom = $state(true);
  let menuOpen = $state(false);

  const session = $derived($sessions.find((s) => s.id === $currentSessionId));
  const items = $derived($transcripts.get($currentSessionId) ?? []);
  const live = $derived($sessions.filter((s) => !s.archived));
  const workspace = $derived($workspaces.find((w) => w.path === session?.workspace));
  const runner = $derived($runners.find((r) => r.id === session?.runnerId));

  const pendingApproval = $derived(
    [...items].reverse().find(
      (i): i is Extract<TranscriptItem, { kind: 'approval' }> => i.kind === 'approval' && i.resolved === null,
    ),
  );

  type Block =
    | { kind: 'activity'; key: number; tools: string[] }
    | { kind: 'item'; key: number; item: TranscriptItem };
  const blocks = $derived.by(() => {
    const out: Block[] = [];
    for (const item of items) {
      const last = out[out.length - 1];
      if (item.kind === 'tool') {
        if (last?.kind === 'activity') last.tools.push(item.summary);
        else out.push({ kind: 'activity', key: item.seq, tools: [item.summary] });
      } else if (item.kind === 'done' && !item.summary) {
        continue;
      } else if (item.kind === 'approval' && item.resolved === null) {
        continue; // pending approvals live in the sheet, not the scroll
      } else {
        out.push({ kind: 'item', key: item.seq, item });
      }
    }
    return out;
  });

  $effect(() => {
    if ($currentSessionId) void ensureHistory($currentSessionId);
  });

  $effect(() => {
    void items.length;
    if (atBottom && scroller) void tick().then(() => scroller!.scrollTo({ top: scroller!.scrollHeight }));
  });

  function onScroll(): void {
    if (!scroller) return;
    atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 60;
  }

  function submitPrompt(text: string): void {
    if (session) send({ type: 'prompt', sessionId: session.id, prompt: text });
  }

  function stopRun(): void {
    if (session) send({ type: 'cancel', sessionId: session.id });
  }

  function resetConversation(): void {
    menuOpen = false;
    if (session && confirm('Start a fresh conversation? The agent forgets prior context.')) {
      send({ type: 'session-reset', sessionId: session.id });
    }
  }

  function archiveSession(): void {
    menuOpen = false;
    if (session && confirm('Archive this session?')) {
      send({ type: 'session-update', sessionId: session.id, archived: true });
    }
  }

  function renameSession(): void {
    menuOpen = false;
    if (!session) return;
    const label = prompt('Session name', session.label);
    if (label?.trim()) send({ type: 'session-update', sessionId: session.id, label: label.trim() });
  }
</script>

{#if !session}
  <div class="empty">
    <div class="empty-icon"><Icon name="chat" size={20} /></div>
    <p class="t">No session selected</p>
    <p class="s">Pick one from Home to get started.</p>
  </div>
{:else}
  <div class="context">
    <div class="ctx-row">
      <div class="select-wrap">
        <select value={session.id} onchange={(e) => currentSessionId.set((e.target as HTMLSelectElement).value)}>
          {#each live as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
        </select>
        <Icon name="chevron-down" size={14} />
      </div>
      <button class="icon-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="Session menu">
        <Icon name="ellipsis" size={17} />
      </button>
    </div>
    <div class="ctx-meta">
      <span>{runner?.name ?? session.runnerId}{session.model ? ` · ${session.model}` : ''}</span>
      {#if workspace?.gitBranch}<span class="sep">·</span><span class="mono">{workspace.gitBranch}</span>{/if}
      {#if workspace}<span class="sep">·</span><span class="cap">{workspace.policy}</span>{/if}
      {#if runner && !runner.supportsApprovals}<span class="sep">·</span><span class="warn">unguarded</span>{/if}
    </div>
    {#if session.busy}<div class="shimmer"></div>{/if}
  </div>

  {#if menuOpen}
    <div class="menu-scrim" onclick={() => (menuOpen = false)} onkeydown={() => {}} role="presentation"></div>
    <div class="menu">
      <button onclick={renameSession}>Rename</button>
      <button onclick={resetConversation}><Icon name="refresh" size={14} />New conversation</button>
      <button class="danger" onclick={archiveSession}><Icon name="archive" size={14} />Archive</button>
    </div>
  {/if}

  <div class="transcript" bind:this={scroller} onscroll={onScroll}>
    {#each blocks as block (block.key)}
      {#if block.kind === 'activity'}
        <details class="activity">
          <summary><Icon name="terminal" size={12} />{block.tools.length} action{block.tools.length > 1 ? 's' : ''}<Icon name="chevron-down" size={12} /></summary>
          <ul>{#each block.tools as t, i (i)}<li>{t}</li>{/each}</ul>
        </details>
      {:else if block.item.kind === 'prompt'}
        <div class="bubble">{block.item.text}</div>
      {:else if block.item.kind === 'text'}
        <!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown escapes all input -->
        <div class="agent md">{@html renderMarkdown(block.item.text)}</div>
      {:else if block.item.kind === 'done'}
        <div class="agent dim">{block.item.summary}</div>
      {:else if block.item.kind === 'approval'}
        <div class="resolved" class:ok={block.item.resolved}>
          <Icon name={block.item.resolved ? 'check' : 'x'} size={12} />
          {block.item.resolved ? 'Approved' : 'Denied'} · {block.item.action}
        </div>
      {:else if block.item.kind === 'receipt'}
        <ReceiptCard receipt={block.item.receipt} />
      {:else if block.item.kind === 'error'}
        <div class="error">{block.item.message}</div>
      {/if}
    {:else}
      <div class="empty">
        <div class="empty-icon"><Icon name="terminal" size={18} /></div>
        <p class="t">Ready when you are</p>
        <p class="s">Standing by on {session.workspace.split(/[\\/]/).pop()}.</p>
      </div>
    {/each}
  </div>

  <Composer busy={session.busy} queued={session.queuedPrompts} onsubmit={submitPrompt} onstop={stopRun} />

  {#if pendingApproval}
    <ApprovalSheet sessionId={session.id} approval={pendingApproval} />
  {/if}
{/if}

<style>
  .empty { flex: 1; text-align: center; padding: 3.5rem 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.3rem; }
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

  .context { position: relative; padding: 0 1.25rem 0.5rem; flex-shrink: 0; }
  .ctx-row { display: flex; align-items: center; gap: 0.5rem; }
  .select-wrap { display: flex; align-items: center; gap: 0.25rem; flex: 1; min-width: 0; color: var(--ghost); }
  .select-wrap select {
    background: transparent;
    border: none;
    font-weight: 700;
    font-size: 16px;
    padding: 0.2rem 0;
    appearance: none;
    max-width: 100%;
    text-overflow: ellipsis;
    color: var(--ink);
  }
  .icon-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    color: var(--mute);
    border-radius: 8px;
  }
  .icon-btn:active { background: var(--card); }
  .ctx-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 11.5px;
    color: var(--ghost);
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
  }
  .sep { opacity: 0.5; }
  .mono { font-family: var(--mono); font-size: 11px; }
  .cap { text-transform: capitalize; }
  .warn { color: var(--warn); font-weight: 600; }
  .shimmer {
    position: absolute;
    left: 1.25rem;
    right: 1.25rem;
    bottom: 0;
    height: 2px;
    border-radius: 1px;
    background: linear-gradient(90deg, transparent, var(--brand), transparent);
    background-size: 200% 100%;
    animation: slide 1.4s linear infinite;
  }
  @keyframes slide { from { background-position: 200% 0; } to { background-position: -200% 0; } }

  .menu-scrim { position: fixed; inset: 0; z-index: 20; }
  .menu {
    position: absolute;
    top: calc(var(--inset-t) + 3.4rem);
    right: 1.25rem;
    z-index: 21;
    background: var(--raised);
    border: 1px solid var(--hairline-2);
    border-radius: 12px;
    padding: 0.35rem;
    display: flex;
    flex-direction: column;
    min-width: 190px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
    animation: pop 0.12s ease-out;
  }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px); } }
  .menu button {
    justify-content: flex-start;
    height: 40px;
    background: transparent;
    color: var(--ink);
    font-weight: 500;
    border-radius: 8px;
    gap: 0.6rem;
  }
  .menu button:active { background: var(--card); }
  .menu .danger { color: var(--risk); }

  .transcript {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 0.4rem 1.25rem 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .bubble {
    align-self: flex-end;
    max-width: 84%;
    background: var(--raised);
    border: 1px solid var(--hairline);
    border-radius: 18px 18px 6px 18px;
    padding: 0.6rem 0.95rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 0.55rem;
    font-size: 14.5px;
  }
  .agent { max-width: 94%; font-size: 15px; line-height: 1.6; word-break: break-word; }
  .agent.dim { color: var(--mute); }
  .md :global(p) { margin: 0 0 0.35rem; }
  .md :global(h3), .md :global(h4), .md :global(h5) { margin: 0.6rem 0 0.25rem; font-size: 15.5px; }
  .md :global(ul) { margin: 0.2rem 0 0.4rem; padding-left: 1.3rem; }
  .md :global(code) {
    font: 12.5px var(--mono);
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: 5px;
    padding: 0.05rem 0.35rem;
  }
  .md :global(.md-code) {
    font: 12px/1.55 var(--mono);
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: var(--r-ctl);
    padding: 0.6rem 0.8rem;
    overflow-x: auto;
    margin: 0.35rem 0;
  }
  .md :global(a) { color: var(--brand); }

  .activity {
    align-self: flex-start;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 0.22rem 0.75rem;
    font-size: 12px;
    font-weight: 500;
    color: var(--mute);
    max-width: 94%;
  }
  .activity[open] { border-radius: 12px; }
  .activity summary {
    cursor: pointer;
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .activity summary::-webkit-details-marker { display: none; }
  .activity ul { margin: 0.45rem 0 0.25rem; padding-left: 0.2rem; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
  .activity li { font: 11px/1.5 var(--mono); color: var(--ghost); word-break: break-all; }

  .resolved {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    align-self: flex-start;
    font-size: 12px;
    font-weight: 600;
    color: var(--risk);
    background: var(--risk-soft);
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
  }
  .resolved.ok { color: var(--ok); background: var(--ok-soft); }

  .error {
    background: var(--risk-soft);
    border: 1px solid color-mix(in srgb, var(--risk) 25%, transparent);
    border-radius: var(--r-ctl);
    color: var(--risk);
    padding: 0.55rem 0.85rem;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 94%;
  }
</style>
