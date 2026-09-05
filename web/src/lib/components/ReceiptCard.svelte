<script lang="ts">
  import type { Receipt } from '@offhand/shared';
  import { fetchArtifact } from '$lib/client.js';
  import Icon from './Icon.svelte';

  let { receipt }: { receipt: Receipt } = $props();

  let imgUrl = $state('');
  let imgError = $state('');
  let showShot = $state(false);
  let showDiff = $state(false);

  async function loadShot(): Promise<void> {
    showShot = true;
    if (imgUrl || !receipt.screenshotBlobId) return;
    try {
      const bytes = await fetchArtifact(receipt.screenshotBlobId);
      imgUrl = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' }));
    } catch (e) {
      imgError = e instanceof Error ? e.message : String(e);
    }
  }

  const secs = $derived(Math.round(receipt.durationMs / 1000));
</script>

<div class="receipt">
  <div class="row">
    <span class="status" class:fail={!receipt.ok}>
      <Icon name={receipt.ok ? 'check' : 'x'} size={13} stroke={2.5} />
    </span>
    <span class="summary">
      {#if receipt.filesChanged > 0}
        {receipt.filesChanged} file{receipt.filesChanged > 1 ? 's' : ''} changed
        <span class="add">+{receipt.additions}</span>
        <span class="del">−{receipt.deletions}</span>
      {:else}
        {receipt.ok ? 'Completed' : 'Failed'} · no file changes
      {/if}
    </span>
    <span class="time">{secs}s</span>
  </div>

  {#if receipt.diff || receipt.screenshotBlobId}
    <div class="actions">
      {#if receipt.diff}
        <button class="action" class:on={showDiff} onclick={() => (showDiff = !showDiff)}>
          <Icon name="diff" size={13} />{showDiff ? 'Hide diff' : 'Diff'}
        </button>
      {/if}
      {#if receipt.screenshotBlobId && !showShot}
        <button class="action" onclick={loadShot}><Icon name="camera" size={13} />Screenshot</button>
      {/if}
    </div>
  {/if}

  {#if showDiff && receipt.diff}
    <pre>{#each receipt.diff.split('\n') as line, i (i)}<span
          class:dadd={line.startsWith('+') && !line.startsWith('+++')}
          class:ddel={line.startsWith('-') && !line.startsWith('---')}
          class:dhunk={line.startsWith('@@')}>{line}
</span>{/each}</pre>
  {/if}

  {#if showShot}
    {#if imgError}
      <div class="note bad">Screenshot failed · {imgError}</div>
    {:else if imgUrl}
      <img src={imgUrl} alt="After this run" />
    {:else}
      <div class="note">Decrypting…</div>
    {/if}
  {/if}
</div>

<style>
  .receipt {
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 0.7rem 0.95rem;
    max-width: 94%;
    font-size: 13.5px;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .row { display: flex; align-items: center; gap: 0.6rem; }
  .status {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--ok-soft);
    color: var(--ok);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .status.fail { background: var(--bad-soft); color: var(--bad); }
  .summary { flex: 1; font-weight: 500; }
  .add { color: var(--ok); font-weight: 600; }
  .del { color: var(--bad); font-weight: 600; }
  .time { color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums; }
  .actions { display: flex; gap: 0.45rem; }
  .action {
    height: 30px;
    padding: 0 0.75rem;
    background: transparent;
    border: 1px solid var(--hairline-strong);
    color: var(--muted);
    font-size: 12px;
    border-radius: var(--r-sm);
    gap: 0.35rem;
  }
  .action:hover, .action.on { background: var(--surface-2); color: var(--text); }
  pre {
    overflow-x: auto;
    font: 11px/1.55 var(--font-mono);
    max-height: 46vh;
    margin: 0;
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    padding: 0.6rem 0.8rem;
  }
  pre span { display: block; white-space: pre; }
  .dadd { color: var(--ok); }
  .ddel { color: var(--bad); }
  .dhunk { color: var(--muted); }
  img { max-width: 100%; border-radius: var(--r-md); border: 1px solid var(--hairline); }
  .note { color: var(--muted); font-size: 12.5px; }
  .note.bad { color: var(--bad); }
</style>
