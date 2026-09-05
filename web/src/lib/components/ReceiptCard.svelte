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
      <Icon name={receipt.ok ? 'check' : 'x'} size={12} stroke={2.6} />
    </span>
    <span class="summary">
      {#if receipt.filesChanged > 0}
        {receipt.filesChanged} file{receipt.filesChanged > 1 ? 's' : ''}
        <span class="add">+{receipt.additions}</span>
        <span class="del">−{receipt.deletions}</span>
      {:else}
        {receipt.ok ? 'Completed' : 'Failed'}
      {/if}
    </span>
    <span class="time">{secs}s</span>
    {#if receipt.diff}
      <button class="chip" class:on={showDiff} onclick={() => (showDiff = !showDiff)}>
        <Icon name="diff" size={12} />Diff
      </button>
    {/if}
    {#if receipt.screenshotBlobId && !showShot}
      <button class="chip" onclick={loadShot}><Icon name="camera" size={12} /></button>
    {/if}
  </div>

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
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: 12px;
    padding: 0.55rem 0.75rem;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .row { display: flex; align-items: center; gap: 0.55rem; }
  .status {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--ok-soft);
    color: var(--ok);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .status.fail { background: var(--risk-soft); color: var(--risk); }
  .summary { flex: 1; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .add { color: var(--ok); font-weight: 600; }
  .del { color: var(--risk); font-weight: 600; }
  .time { color: var(--ghost); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .chip {
    height: 26px;
    padding: 0 0.6rem;
    background: transparent;
    border: 1px solid var(--hairline-2);
    color: var(--mute);
    font-size: 11.5px;
    border-radius: 8px;
    gap: 0.3rem;
    flex-shrink: 0;
  }
  .chip:active, .chip.on { background: var(--raised); color: var(--ink); }
  pre {
    overflow-x: auto;
    font: 11px/1.55 var(--mono);
    max-height: 44vh;
    margin: 0;
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: var(--r-ctl);
    padding: 0.55rem 0.75rem;
  }
  pre span { display: block; white-space: pre; }
  .dadd { color: var(--ok); }
  .ddel { color: var(--risk); }
  .dhunk { color: var(--mute); }
  img { max-width: 100%; border-radius: var(--r-ctl); border: 1px solid var(--hairline); }
  .note { color: var(--mute); font-size: 12px; }
  .note.bad { color: var(--risk); }
</style>
