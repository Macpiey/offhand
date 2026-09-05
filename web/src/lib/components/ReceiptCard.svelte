<script lang="ts">
  import type { Receipt } from '@offhand/shared';
  import { fetchArtifact } from '$lib/client.js';

  let { receipt }: { receipt: Receipt } = $props();

  let imgUrl = $state('');
  let imgError = $state('');
  let showShot = $state(false);

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
  <div class="head">
    {receipt.ok ? '✔' : '✖'} {secs}s · {receipt.toolCount} actions ·
    {#if receipt.filesChanged > 0}
      {receipt.filesChanged} file{receipt.filesChanged > 1 ? 's' : ''}
      <span class="add">+{receipt.additions}</span>
      <span class="del">−{receipt.deletions}</span>
    {:else}no file changes{/if}
  </div>

  {#if receipt.diff}
    <details>
      <summary>view diff</summary>
      <pre>{#each receipt.diff.split('\n') as line, i (i)}<span
            class:dadd={line.startsWith('+') && !line.startsWith('+++')}
            class:ddel={line.startsWith('-') && !line.startsWith('---')}
            class:dhunk={line.startsWith('@@')}>{line}
</span>{/each}</pre>
    </details>
  {/if}

  {#if receipt.screenshotBlobId}
    {#if !showShot}
      <button class="shot-btn" onclick={loadShot}>📷 view screenshot</button>
    {:else if imgError}
      <div class="err">screenshot failed: {imgError}</div>
    {:else if imgUrl}
      <img src={imgUrl} alt="screenshot after run" />
    {:else}
      <div class="loading">decrypting…</div>
    {/if}
  {/if}
</div>

<style>
  .receipt {
    border: 1px solid #238636;
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
    margin: 0.4rem 0;
    font-size: 13px;
  }
  .receipt.fail { border-color: #f85149; }
  .head { color: #e6edf3; }
  .add { color: #3fb950; }
  .del { color: #f85149; }
  summary { cursor: pointer; color: #8b949e; margin-top: 0.3rem; }
  pre { overflow-x: auto; font-size: 11px; max-height: 50vh; margin: 0.4rem 0 0; }
  pre span { display: block; white-space: pre; }
  .dadd { color: #3fb950; }
  .ddel { color: #f85149; }
  .dhunk { color: #58a6ff; }
  .shot-btn { background: #21262d; margin-top: 0.5rem; font-size: 12px; padding: 0.35rem 0.7rem; }
  img { max-width: 100%; border-radius: 8px; margin-top: 0.5rem; border: 1px solid #30363d; }
  .loading, .err { color: #8b949e; font-size: 12px; padding-top: 0.4rem; }
  .err { color: #f85149; }
</style>
