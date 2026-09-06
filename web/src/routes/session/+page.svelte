<script lang="ts">
  import { tick } from 'svelte';
  import { sessions, transcripts, currentSessionId, runners, workspaces, conn, usageBySession, type TranscriptItem } from '$lib/stores.js';
  import { send, ensureHistory } from '$lib/client.js';
  import { portal } from '$lib/portal.js';
  import { renderMarkdown } from '$lib/markdown.js';
  import ReceiptCard from '$lib/components/ReceiptCard.svelte';
  import Composer from '$lib/components/Composer.svelte';
  import ApprovalSheet from '$lib/components/ApprovalSheet.svelte';
  import MenuButton from '$lib/components/MenuButton.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let scroller = $state<HTMLElement | null>(null);
  let atBottom = $state(true);
  let menuOpen = $state(false);
  let configOpen = $state(false);

  const MODES: { id: 'guarded' | 'plan' | 'acceptEdits' | 'bypass'; label: string; desc: string }[] = [
    { id: 'guarded', label: 'Guarded', desc: 'Risky actions ask you first' },
    { id: 'plan', label: 'Plan', desc: 'Plans before making changes' },
    { id: 'acceptEdits', label: 'Accept edits', desc: 'File edits sail through, commands still ask' },
    { id: 'bypass', label: 'Bypass', desc: 'Never asks — full trust' },
  ];
  const EFFORTS: { id: '' | 'low' | 'medium' | 'high' | 'max'; label: string }[] = [
    { id: '', label: 'Default' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Med' },
    { id: 'high', label: 'High' },
    { id: 'max', label: 'Max' },
  ];

  const session = $derived($sessions.find((s) => s.id === $currentSessionId));
  const items = $derived($transcripts.get($currentSessionId) ?? []);
  const live = $derived($sessions.filter((s) => !s.archived));
  const workspace = $derived($workspaces.find((w) => w.path === session?.workspace));
  const runner = $derived($runners.find((r) => r.id === session?.runnerId));
  const usage = $derived($usageBySession.get($currentSessionId));
  const ctxPct = $derived(usage ? Math.min(100, Math.round((usage.contextTokens / usage.contextWindow) * 100)) : null);

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

  function submitPrompt(text: string, attachments: { blobId: string; name: string; mime: string }[]): void {
    if (session) {
      send({ type: 'prompt', sessionId: session.id, prompt: text, ...(attachments.length ? { attachments } : {}) });
    }
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
      <MenuButton />
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
    <button class="ctx-meta" onclick={() => (configOpen = true)} aria-label="Session settings">
      <span class="status-dot" class:off={$conn.phase !== 'connected' || !$conn.daemonOnline}></span>
      <span>{runner?.name ?? session.runnerId}</span>
      {#if workspace?.gitBranch}<span class="sep">·</span><span class="mono">{workspace.gitBranch}</span>{/if}
      {#if runner && !runner.supportsApprovals}<span class="sep">·</span><span class="warn">unguarded</span>{/if}
    </button>
    {#if session.busy}<div class="shimmer"></div>{/if}
  </div>

  {#if menuOpen}
    <div class="menu-scrim" onclick={() => (menuOpen = false)} onkeydown={() => {}} role="presentation"></div>
    <div class="menu">
      <button onclick={() => { menuOpen = false; configOpen = true; }}><Icon name="settings" size={14} />Session settings</button>
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
          {#if block.item.answer}Answered · {block.item.answer}{:else}{block.item.resolved ? 'Approved' : 'Denied'} · {block.item.action}{/if}
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

  <Composer
    busy={session.busy}
    queued={session.queuedPrompts}
    onsubmit={submitPrompt}
    onstop={stopRun}
    modeLabel={MODES.find((m) => m.id === (session.permissionMode ?? 'guarded'))?.label ?? ''}
    modelLabel={session.model || 'Default model'}
    effortLabel={session.effort ? EFFORTS.find((e) => e.id === session.effort)?.label ?? '' : ''}
    ctxPct={ctxPct}
    onConfig={() => (configOpen = true)}
  />

  {#if pendingApproval}
    <ApprovalSheet sessionId={session.id} approval={pendingApproval} />
  {/if}

  {#if configOpen}
    <div class="cfg-overlay" use:portal onclick={() => (configOpen = false)} onkeydown={(e) => e.key === 'Escape' && (configOpen = false)} role="presentation">
      <div class="cfg-sheet" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Session settings" tabindex="-1" onkeydown={() => {}}>
        <div class="handle"></div>
        <h2>Session settings</h2>

        {#if usage}
          <div class="usage-card">
            <div class="u-row">
              <span class="u-k">Context window</span>
              <span class="u-v">{(usage.contextTokens / 1000).toFixed(1)}k / {(usage.contextWindow / 1000).toFixed(0)}k · {ctxPct}%</span>
            </div>
            <div class="u-bar"><span class="u-fill" class:hot={(ctxPct ?? 0) > 80} style="width:{ctxPct}%"></span></div>
            {#if usage.costUsd > 0}
              <div class="u-row">
                <span class="u-k">This session (API-equivalent)</span>
                <span class="u-v">${usage.costUsd.toFixed(2)}</span>
              </div>
            {/if}
          </div>
        {/if}

        {#if runner && runner.models.length > 0}
          <span class="group">Model</span>
          <select
            value={session.model ?? ''}
            onchange={(e) => send({ type: 'session-update', sessionId: session.id, model: (e.target as HTMLSelectElement).value })}
          >
            <option value="">Default</option>
            {#each runner.models as m (m)}<option value={m}>{m}</option>{/each}
          </select>
        {/if}

        <span class="group">Permission mode</span>
        <div class="cfg-opts">
          {#each MODES as m (m.id)}
            <button
              class="cfg-opt"
              class:sel={(session.permissionMode ?? 'guarded') === m.id}
              onclick={() => send({ type: 'session-update', sessionId: session.id, permissionMode: m.id })}
            >
              <span class="radio" class:on={(session.permissionMode ?? 'guarded') === m.id}></span>
              <span class="cfg-copy"><span class="cfg-label">{m.label}</span><span class="cfg-desc">{m.desc}</span></span>
            </button>
          {/each}
        </div>

        <span class="group">Thinking effort{session.effort ? '' : ' · default'}</span>
        <div class="seg">
          {#each EFFORTS.filter((e) => e.id !== '') as ef (ef.id)}
            <button
              class="seg-btn"
              class:sel={session.effort === ef.id}
              onclick={() => ef.id && send({ type: 'session-update', sessionId: session.id, effort: ef.id })}
            >{ef.label}</button>
          {/each}
        </div>

        <button class="cfg-done" onclick={() => (configOpen = false)}>Done</button>
      </div>
    </div>
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
  /* On phones the context bar IS the header — reclaim the brand row's space. */
  @media (max-width: 699.9px) {
    .context { padding-top: calc(var(--inset-t) + 0.35rem); }
  }
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
    background: transparent;
    border: none;
    height: auto;
    padding: 0.15rem 0;
    font-weight: 500;
    cursor: pointer;
    max-width: 100%;
  }
  .ctx-meta:active { background: transparent; transform: none; }
  .sep { opacity: 0.5; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); flex-shrink: 0; }
  .status-dot.off { background: var(--warn); }

  .cfg-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: calc(100dvh - var(--vvh, 100dvh) - var(--vvo, 0px));
  }
  .cfg-sheet {
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
  .cfg-opts { display: flex; flex-direction: column; gap: 0.4rem; }
  .cfg-opt {
    justify-content: flex-start;
    min-height: 48px;
    height: auto;
    padding: 0.5rem 0.9rem;
    background: var(--bg);
    border: 1px solid var(--hairline);
    color: var(--ink);
    font-weight: 500;
    gap: 0.7rem;
    border-radius: 12px;
    text-align: left;
  }
  .cfg-opt:active { background: var(--bg); }
  .cfg-opt.sel { border-color: var(--brand); }
  .radio { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--ghost); flex-shrink: 0; }
  .radio.on { border-color: var(--brand); background: radial-gradient(circle, var(--brand) 45%, transparent 50%); }
  .cfg-copy { display: flex; flex-direction: column; gap: 1px; }
  .cfg-label { font-size: 14px; font-weight: 600; }
  .cfg-desc { font-size: 11.5px; color: var(--mute); font-weight: 400; }
  .seg { display: flex; gap: 4px; background: var(--bg); border: 1px solid var(--hairline); border-radius: 11px; padding: 4px; }
  .seg-btn {
    flex: 1;
    height: 34px;
    background: transparent;
    color: var(--mute);
    font-size: 12.5px;
    border-radius: 8px;
    padding: 0;
  }
  .seg-btn.sel { background: var(--raised); color: var(--ink); }
  .cfg-done { margin-top: 0.5rem; height: 46px; }
  .usage-card {
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: 12px;
    padding: 0.75rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .u-row { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
  .u-k { font-size: 12px; color: var(--mute); }
  .u-v { font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .u-bar { height: 5px; border-radius: 3px; background: var(--raised); overflow: hidden; }
  .u-fill { display: block; height: 100%; border-radius: 3px; background: var(--brand); }
  .u-fill.hot { background: var(--warn); }
  .mono { font-family: var(--mono); font-size: 11px; }
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
    background: var(--bubble);
    color: var(--bubble-ink);
    border-radius: 18px 18px 6px 18px;
    padding: 0.6rem 0.95rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 0.55rem;
    font-size: 14.5px;
    font-weight: 500;
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
