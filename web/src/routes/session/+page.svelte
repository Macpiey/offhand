<script lang="ts">
  import { tick } from 'svelte';
  import { sessions, transcripts, currentSessionId, runners, type TranscriptItem } from '$lib/stores.js';
  import { send, ensureHistory, answerApproval } from '$lib/client.js';
  import ReceiptCard from '$lib/components/ReceiptCard.svelte';
  import Composer from '$lib/components/Composer.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let scroller = $state<HTMLElement | null>(null);
  let atBottom = $state(true);

  const session = $derived($sessions.find((s) => s.id === $currentSessionId));
  const items = $derived($transcripts.get($currentSessionId) ?? []);
  const live = $derived($sessions.filter((s) => !s.archived));

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
        continue; // silent completion — the receipt tells the story
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

  function resetConversation(): void {
    if (session && confirm('Start a fresh conversation? The agent forgets prior context.')) {
      send({ type: 'session-reset', sessionId: session.id });
    }
  }
</script>

{#if !session}
  <div class="empty">
    <div class="empty-icon"><Icon name="chat" size={22} /></div>
    <p class="empty-title">No session selected</p>
    <p class="empty-sub">Pick one from the Sessions tab.</p>
  </div>
{:else}
  <div class="head">
    <div class="select-wrap">
      <select value={session.id} onchange={(e) => currentSessionId.set((e.target as HTMLSelectElement).value)}>
        {#each live as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
      </select>
      <span class="select-chevron"><Icon name="chevron-down" size={15} /></span>
    </div>
    {#if $runners.find((r) => r.id === session.runnerId)?.supportsApprovals === false}
      <span class="pill warn" title="This agent's CLI has no approval hook">Unguarded</span>
    {/if}
    <button class="icon-btn" onclick={resetConversation} aria-label="New conversation">
      <Icon name="refresh" size={16} />
    </button>
  </div>

  <div class="transcript" bind:this={scroller} onscroll={onScroll}>
    {#each blocks as block (block.key)}
      {#if block.kind === 'activity'}
        <details class="activity">
          <summary>
            <Icon name="terminal" size={13} />
            {block.tools.length} action{block.tools.length > 1 ? 's' : ''}
            <Icon name="chevron-down" size={13} />
          </summary>
          <ul>
            {#each block.tools as t, i (i)}<li>{t}</li>{/each}
          </ul>
        </details>
      {:else if block.item.kind === 'prompt'}
        <div class="bubble">{block.item.text}</div>
      {:else if block.item.kind === 'text'}
        <div class="agent-text">{block.item.text}</div>
      {:else if block.item.kind === 'done'}
        <div class="agent-text muted">{block.item.summary}</div>
      {:else if block.item.kind === 'approval'}
        <div class="approval">
          <div class="approval-head">
            <span class="approval-icon" class:high={block.item.risk === 'high'}>
              <Icon name={block.item.risk === 'high' ? 'alert' : 'lock'} size={16} />
            </span>
            <div class="approval-copy">
              <div class="approval-title">
                {block.item.risk === 'high' ? 'High-risk action' : 'Permission needed'}
              </div>
              <div class="approval-detail">{block.item.action} · {block.item.detail}</div>
            </div>
          </div>
          {#if block.item.resolved === null}
            {@const it = block.item}
            <div class="approval-actions">
              <button class="deny" onclick={() => answerApproval(session.id, it.approvalId, false)}>Deny</button>
              <button class="approve" onclick={() => answerApproval(session.id, it.approvalId, true)}>Approve</button>
            </div>
          {:else}
            <div class="verdict" class:ok={block.item.resolved}>
              <Icon name={block.item.resolved ? 'check' : 'x'} size={13} />
              {block.item.resolved ? 'Approved' : 'Denied'}
            </div>
          {/if}
        </div>
      {:else if block.item.kind === 'receipt'}
        <ReceiptCard receipt={block.item.receipt} />
      {:else if block.item.kind === 'error'}
        <div class="error">{block.item.message}</div>
      {/if}
    {:else}
      <div class="empty">
        <div class="empty-icon"><Icon name="terminal" size={20} /></div>
        <p class="empty-title">Ready when you are</p>
        <p class="empty-sub">Your agent is standing by on {session.workspace.split(/[\\/]/).pop()}.</p>
      </div>
    {/each}
  </div>

  <Composer busy={session.busy} queued={session.queuedPrompts} onsubmit={submitPrompt} />
{/if}

<style>
  .empty { text-align: center; padding: 3.5rem 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
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

  .head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.15rem 1.25rem 0.6rem;
  }
  .select-wrap { position: relative; flex: 1; min-width: 0; }
  .select-wrap select {
    width: 100%;
    background: transparent;
    border: none;
    font-weight: 600;
    font-size: 15.5px;
    padding: 0.35rem 1.6rem 0.35rem 0;
    appearance: none;
    text-overflow: ellipsis;
  }
  .select-chevron {
    position: absolute;
    right: 0.2rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--faint);
    pointer-events: none;
    display: grid;
    place-items: center;
  }
  .pill {
    font-size: 11px;
    font-weight: 600;
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    white-space: nowrap;
  }
  .pill.warn { background: var(--warn-soft); color: var(--warn); }
  .icon-btn { width: 34px; height: 34px; padding: 0; background: var(--surface); border: 1px solid var(--hairline); color: var(--muted); border-radius: var(--r-sm); }
  .icon-btn:hover { background: var(--surface-2); }

  .transcript {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem 1.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .bubble {
    align-self: flex-end;
    max-width: 84%;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    border-bottom-right-radius: var(--r-sm);
    padding: 0.6rem 0.95rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 0.5rem;
    font-size: 14.5px;
  }
  .agent-text {
    max-width: 94%;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 15px;
    line-height: 1.6;
  }
  .agent-text.muted { color: var(--muted); }

  .activity {
    align-self: flex-start;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 0.25rem 0.8rem;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    max-width: 94%;
  }
  .activity[open] { border-radius: var(--r-md); }
  .activity summary {
    cursor: pointer;
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .activity summary::-webkit-details-marker { display: none; }
  .activity ul { margin: 0.5rem 0 0.3rem; padding-left: 0.3rem; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
  .activity li {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--faint);
    word-break: break-all;
  }

  .approval {
    background: var(--surface);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-lg);
    padding: 0.85rem 0.95rem;
    max-width: 94%;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .approval-head { display: flex; gap: 0.7rem; align-items: flex-start; }
  .approval-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--r-sm);
    background: var(--warn-soft);
    color: var(--warn);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .approval-icon.high { background: var(--bad-soft); color: var(--bad); }
  .approval-copy { min-width: 0; }
  .approval-title { font-weight: 600; font-size: 14.5px; }
  .approval-detail {
    color: var(--muted);
    font-size: 12px;
    font-family: var(--font-mono);
    word-break: break-all;
    margin-top: 0.2rem;
  }
  .approval-actions { display: flex; gap: 0.55rem; }
  .approve { flex: 1; }
  .deny { flex: 1; background: var(--surface-2); color: var(--text); border: 1px solid var(--hairline); }
  .deny:hover { background: var(--surface-2); border-color: var(--bad); color: var(--bad); }
  .verdict {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--bad);
  }
  .verdict.ok { color: var(--ok); }

  .error {
    background: var(--bad-soft);
    border: 1px solid color-mix(in srgb, var(--bad) 25%, transparent);
    border-radius: var(--r-md);
    color: var(--bad);
    padding: 0.6rem 0.9rem;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 94%;
  }
</style>
