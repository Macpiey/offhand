<script lang="ts">
  import { tick } from 'svelte';
  import { sessions, transcripts, currentSessionId, runners, type TranscriptItem } from '$lib/stores.js';
  import { send, ensureHistory, answerApproval } from '$lib/client.js';
  import ReceiptCard from '$lib/components/ReceiptCard.svelte';
  import Composer from '$lib/components/Composer.svelte';

  let scroller = $state<HTMLElement | null>(null);
  let atBottom = $state(true);

  const session = $derived($sessions.find((s) => s.id === $currentSessionId));
  const items = $derived($transcripts.get($currentSessionId) ?? []);
  const live = $derived($sessions.filter((s) => !s.archived));

  /** Group consecutive tool lines into a single collapsible activity block. */
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
    <p class="empty-title">No session selected</p>
    <p class="empty-sub">Pick one from the Sessions tab.</p>
  </div>
{:else}
  <div class="head">
    <select value={session.id} onchange={(e) => currentSessionId.set((e.target as HTMLSelectElement).value)}>
      {#each live as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
    </select>
    {#if $runners.find((r) => r.id === session.runnerId)?.supportsApprovals === false}
      <span class="gate-warn" title="This agent's CLI has no approval hook — it runs unguarded">unguarded</span>
    {/if}
    <button class="reset" onclick={resetConversation} title="New conversation" aria-label="New conversation">↺</button>
  </div>

  <div class="transcript" bind:this={scroller} onscroll={onScroll}>
    {#each blocks as block (block.key)}
      {#if block.kind === 'activity'}
        <details class="activity">
          <summary>{block.tools.length} action{block.tools.length > 1 ? 's' : ''}</summary>
          <ul>
            {#each block.tools as t, i (i)}<li>{t}</li>{/each}
          </ul>
        </details>
      {:else if block.item.kind === 'prompt'}
        <div class="bubble user">{block.item.text}</div>
      {:else if block.item.kind === 'text'}
        <div class="agent-text">{block.item.text}</div>
      {:else if block.item.kind === 'approval'}
        <div class="approval" class:high={block.item.risk === 'high'}>
          <div class="approval-head">
            <span class="approval-icon">{block.item.risk === 'high' ? '⚠️' : '🔐'}</span>
            <div>
              <div class="approval-title">
                {block.item.risk === 'high' ? 'High-risk action' : 'Permission needed'}
              </div>
              <div class="approval-detail">{block.item.action} · {block.item.detail}</div>
            </div>
          </div>
          {#if block.item.resolved === null}
            {@const it = block.item}
            <div class="approval-actions">
              <button class="approve" onclick={() => answerApproval(session.id, it.approvalId, true)}>Approve</button>
              <button class="deny" onclick={() => answerApproval(session.id, it.approvalId, false)}>Deny</button>
            </div>
          {:else}
            <div class="verdict" class:ok={block.item.resolved}>
              {block.item.resolved ? '✓ Approved' : '✕ Denied'}
            </div>
          {/if}
        </div>
      {:else if block.item.kind === 'receipt'}
        <ReceiptCard receipt={block.item.receipt} />
      {:else if block.item.kind === 'done'}
        {#if block.item.summary}<div class="agent-text dim">{block.item.summary}</div>{/if}
      {:else if block.item.kind === 'error'}
        <div class="error">{block.item.message}</div>
      {/if}
    {:else}
      <div class="empty">
        <p class="empty-title">Say something</p>
        <p class="empty-sub">Your agent is listening on {session.workspace.split(/[\\/]/).pop()}.</p>
      </div>
    {/each}
  </div>

  <Composer busy={session.busy} queued={session.queuedPrompts} onsubmit={submitPrompt} />
{/if}

<style>
  .empty { text-align: center; padding: 3.5rem 1.5rem; }
  .empty-title { font: 600 19px/1.3 var(--font-display); margin: 0; }
  .empty-sub { color: var(--muted); margin: 0.35rem 0 0; }

  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 1.25rem 0.65rem;
  }
  .head select {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    font-weight: 600;
    font-size: 15px;
    padding: 0.3rem 0;
  }
  .gate-warn {
    font-size: 11px;
    font-weight: 600;
    color: var(--warn);
    background: var(--warn-soft);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    white-space: nowrap;
  }
  .reset { background: var(--surface); color: var(--muted); padding: 0.35rem 0.7rem; font-size: 15px; }

  .transcript {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 1.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .bubble.user {
    align-self: flex-end;
    max-width: 82%;
    background: var(--accent);
    color: #fff;
    border-radius: 20px 20px 6px 20px;
    padding: 0.65rem 1rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 0.6rem;
    font-size: 15px;
  }
  .agent-text {
    max-width: 92%;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    font-size: 15px;
  }
  .agent-text.dim { color: var(--muted); }
  .activity {
    align-self: flex-start;
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: 0.35rem 0.85rem;
    font-size: 12.5px;
    color: var(--muted);
    max-width: 92%;
  }
  .activity summary { cursor: pointer; list-style: none; }
  .activity summary::before { content: '⚙ '; }
  .activity ul { margin: 0.4rem 0 0.25rem; padding-left: 1.1rem; }
  .activity li { font-family: var(--font-mono); font-size: 11.5px; word-break: break-all; }

  .approval {
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
    border-radius: var(--radius);
    padding: 0.9rem 1rem;
    max-width: 92%;
  }
  .approval.high { border-color: color-mix(in srgb, var(--bad) 55%, transparent); background: var(--bad-soft); }
  .approval-head { display: flex; gap: 0.7rem; align-items: flex-start; }
  .approval-icon { font-size: 20px; }
  .approval-title { font-weight: 600; }
  .approval-detail {
    color: var(--muted);
    font-size: 12.5px;
    font-family: var(--font-mono);
    word-break: break-all;
    margin-top: 0.15rem;
  }
  .approval-actions { display: flex; gap: 0.6rem; margin-top: 0.8rem; }
  .approve { background: var(--ok); flex: 1; }
  .deny { background: var(--surface-2); color: var(--bad); flex: 1; }
  .verdict { margin-top: 0.6rem; font-size: 13px; font-weight: 600; color: var(--bad); }
  .verdict.ok { color: var(--ok); }

  .error {
    background: var(--bad-soft);
    border-radius: var(--radius-sm);
    color: var(--bad);
    padding: 0.6rem 0.9rem;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 92%;
  }
</style>
