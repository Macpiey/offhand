<script lang="ts">
  import { tick } from 'svelte';
  import { sessions, transcripts, currentSessionId, runners } from '$lib/stores.js';
  import { send, ensureHistory, answerApproval } from '$lib/client.js';
  import ReceiptCard from '$lib/components/ReceiptCard.svelte';
  import Composer from '$lib/components/Composer.svelte';

  let scroller = $state<HTMLElement | null>(null);
  let atBottom = $state(true);

  const session = $derived($sessions.find((s) => s.id === $currentSessionId));
  const items = $derived($transcripts.get($currentSessionId) ?? []);
  const live = $derived($sessions.filter((s) => !s.archived));

  $effect(() => {
    if ($currentSessionId) void ensureHistory($currentSessionId);
  });

  // Autoscroll while pinned to the bottom.
  $effect(() => {
    void items.length;
    if (atBottom && scroller) void tick().then(() => scroller!.scrollTo({ top: scroller!.scrollHeight }));
  });

  function onScroll(): void {
    if (!scroller) return;
    atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 60;
  }

  function submitPrompt(text: string): void {
    if (!session) return;
    send({ type: 'prompt', sessionId: session.id, prompt: text });
  }

  function resetConversation(): void {
    if (session && confirm('Start a fresh conversation? The agent forgets prior context.')) {
      send({ type: 'session-reset', sessionId: session.id });
    }
  }
</script>

{#if !session}
  <p class="empty">No session selected — pick one from Sessions.</p>
{:else}
  <div class="session-head">
    <select
      value={session.id}
      onchange={(e) => currentSessionId.set((e.target as HTMLSelectElement).value)}
    >
      {#each live as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
    </select>
    <span class="chip">{$runners.find((r) => r.id === session.runnerId)?.name ?? session.runnerId}</span>
    {#if $runners.find((r) => r.id === session.runnerId)?.supportsApprovals === false}
      <span class="chip warn" title="This agent's CLI has no approval hook">no gates</span>
    {/if}
    <button class="ghost small" onclick={resetConversation} title="New conversation">↺</button>
  </div>

  <div class="transcript" bind:this={scroller} onscroll={onScroll}>
    {#each items as item (item.seq + item.kind)}
      {#if item.kind === 'prompt'}
        <div class="prompt">❯ {item.text}</div>
      {:else if item.kind === 'text'}
        <div class="text">{item.text}</div>
      {:else if item.kind === 'tool'}
        <div class="tool">⚙ {item.summary}</div>
      {:else if item.kind === 'approval'}
        <div class="approval" class:high={item.risk === 'high'}>
          <div>🔐 {item.risk === 'high' ? '⚠ HIGH RISK — ' : ''}{item.action}: {item.detail}</div>
          {#if item.resolved === null}
            <div class="buttons">
              <button onclick={() => answerApproval(session.id, item.approvalId, true)}>Approve</button>
              <button class="deny" onclick={() => answerApproval(session.id, item.approvalId, false)}>Deny</button>
            </div>
          {:else}
            <div class="verdict">{item.resolved ? '✔ approved' : '✖ denied'}</div>
          {/if}
        </div>
      {:else if item.kind === 'receipt'}
        <ReceiptCard receipt={item.receipt} />
      {:else if item.kind === 'done'}
        <div class="done">✔ done{item.summary ? ` — ${item.summary}` : ''}</div>
      {:else if item.kind === 'error'}
        <div class="error">✖ {item.message}</div>
      {/if}
    {:else}
      <p class="empty">Say something — your agent is listening.</p>
    {/each}
  </div>

  <Composer busy={session.busy} queued={session.queuedPrompts} onsubmit={submitPrompt} />
{/if}

<style>
  .empty { color: #8b949e; text-align: center; padding: 2rem 1rem; }
  .session-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #21262d;
  }
  .session-head select { flex: 1; min-width: 0; font-size: 12px; padding: 0.35rem 0.5rem; }
  .chip { border: 1px solid #30363d; border-radius: 999px; padding: 0 0.5rem; font-size: 11px; color: #8b949e; white-space: nowrap; }
  .chip.warn { border-color: #d29922; color: #d29922; }
  .ghost { background: #21262d; }
  .small { padding: 0.25rem 0.6rem; }
  .transcript { flex: 1; overflow-y: auto; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .prompt {
    background: #161b22;
    border-radius: 10px;
    padding: 0.5rem 0.75rem;
    margin: 0.5rem 0 0.25rem auto;
    max-width: 85%;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .text { white-space: pre-wrap; word-break: break-word; }
  .tool { color: #d29922; font-size: 12px; }
  .done { color: #3fb950; }
  .error { color: #f85149; white-space: pre-wrap; }
  .approval { border: 1px solid #d29922; border-radius: 10px; padding: 0.6rem 0.8rem; margin: 0.4rem 0; }
  .approval.high { border-color: #f85149; }
  .buttons { display: flex; gap: 0.5rem; padding-top: 0.5rem; }
  .deny { background: #b62324; }
  .verdict { color: #8b949e; padding-top: 0.3rem; font-size: 12px; }
</style>
