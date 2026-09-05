<script lang="ts">
  import type { Receipt } from '@offhand/shared';
  import { fetchArtifact } from '$lib/client.js';

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

<div class="receipt" class:fail={!receipt.ok}>
  <div class="row">
    <span class="check">{receipt.ok ? '✓' : '✕'}</span>
    <span class="summary">
      {#if receipt.filesChanged > 0}
        {receipt.filesChanged} file{receipt.filesChanged > 1 ? 's' : ''} changed
        <span class="add">+{receipt.additions}</span>
        <span class="del">−{receipt.deletions}</span>
      {:else}
        {receipt.ok ? 'Finished' : 'Failed'} — no file changes
      {/if}
    </span>
    <span class="time">{secs}s</span>
  </div>

  {#if receipt.diff || receipt.screenshotBlobId}
    <div class="chips">
      {#if receipt.diff}
        <button class="chip" class:on={showDiff} onclick={() => (showDiff = !showDiff)}>
          {showDiff ? 'Hide diff' : 'View diff'}
        </button>
      {/if}
      {#if receipt.screenshotBlobId && !showShot}
        <button class="chip" onclick={loadShot}>Screenshot</button>
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
      <div class="err">Screenshot failed: {imgError}</div>
    {:else if imgUrl}
      <img src={imgUrl} alt="After this run" />
    {:else}
      <div class="loading">Decrypting…</div>
    {/if}
  {/if}
</div>

<style>
  .receipt {
    background: var(--ok-soft);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    max-width: 92%;
    font-size: 14px;
  }
  .receipt.fail { background: var(--bad-soft); }
  .row { display: flex; align-items: center; gap: 0.6rem; }
  .check { font-weight: 700; color: var(--ok); }
  .fail .check { color: var(--bad); }
  .summary { flex: 1; }
  .add { color: var(--ok); font-weight: 600; }
  .del { color: var(--bad); font-weight: 600; }
  .time { color: var(--muted); font-size: 12.5px; }
  .chips { display: flex; gap: 0.5rem; margin-top: 0.55rem; }
  .chip {
    background: color-mix(in srgb, var(--surface-2) 80%, transparent);
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
    padding: 0.3rem 0.8rem;
  }
  .chip.on { background: var(--surface-2); }
  pre {
    overflow-x: auto;
    font: 11.5px/1.5 var(--font-mono);
    max-height: 50vh;
    margin: 0.6rem 0 0;
    background: var(--bg);
    border-radius: var(--radius-sm);
    padding: 0.6rem 0.8rem;
  }
  pre span { display: block; white-space: pre; }
  .dadd { color: var(--ok); }
  .ddel { color: var(--bad); }
  .dhunk { color: var(--accent); }
  img { max-width: 100%; border-radius: var(--radius-sm); margin-top: 0.6rem; }
  .loading, .err { color: var(--muted); font-size: 12.5px; padding-top: 0.45rem; }
  .err { color: var(--bad); }
</style>
