<script lang="ts">
  import { pairWithCode } from '$lib/client.js';
  import { scanQR, parseScanned } from '$lib/scanner.js';

  let { error = '' }: { error?: string } = $props();

  let code = $state('');
  let relay = $state('');
  let errorMsg = $state('');
  $effect(() => {
    if (error) errorMsg = error;
  });
  let scanning = $state(false);
  let video = $state<HTMLVideoElement | null>(null);
  let abort: AbortController | null = null;

  async function pair(e?: Event): Promise<void> {
    e?.preventDefault();
    errorMsg = '';
    try {
      await pairWithCode(code, relay || undefined);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  }

  async function startScan(): Promise<void> {
    errorMsg = '';
    scanning = true;
    abort = new AbortController();
    // wait a tick for the video element to mount
    await new Promise((r) => setTimeout(r, 50));
    if (!video) return;
    try {
      const text = await scanQR(video, abort.signal);
      scanning = false;
      if (!text) return;
      const parsed = parseScanned(text);
      await pairWithCode(parsed.code, parsed.relay);
    } catch (err) {
      scanning = false;
      errorMsg = err instanceof Error ? err.message : String(err);
    }
  }

  function cancelScan(): void {
    abort?.abort();
    scanning = false;
  }
</script>

<div class="pair">
  <img src="/icons/icon-192.png" alt="offhand" width="72" height="72" />
  <h1>offhand</h1>
  <p class="tagline">Your coding agent, in your pocket.</p>

  <ol>
    <li>On your computer: <code>npx offhand --relay …</code></li>
    <li>Scan the QR it prints:</li>
  </ol>

  <button class="scan" onclick={startScan}>📷 Scan QR code</button>

  <details>
    <summary>or enter the code manually</summary>
    <form onsubmit={pair}>
      <input placeholder="Pairing code (123456.xxxx…)" bind:value={code} autocomplete="off" />
      <input placeholder="Relay URL (leave empty for default)" bind:value={relay} autocomplete="off" />
      <button type="submit" disabled={!code.trim()}>Pair</button>
    </form>
  </details>

  {#if errorMsg}<p class="err">{errorMsg}</p>{/if}
</div>

{#if scanning}
  <div class="scanner">
    <video bind:this={video} playsinline muted></video>
    <button class="cancel" onclick={cancelScan}>Cancel</button>
  </div>
{/if}

<style>
  .pair {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem 1.5rem calc(2rem + env(safe-area-inset-bottom));
    text-align: center;
    min-height: 100dvh;
    box-sizing: border-box;
  }
  img { border-radius: 16px; }
  h1 { margin: 0; font-size: 22px; }
  .tagline { color: #8b949e; margin: 0 0 1rem; }
  ol { text-align: left; color: #8b949e; font-size: 13px; margin: 0 0 0.5rem; }
  code { color: #79c0ff; }
  .scan { background: #1f6feb; width: 100%; max-width: 320px; padding: 0.8rem; font-size: 15px; }
  details { width: 100%; max-width: 320px; color: #8b949e; font-size: 13px; }
  summary { cursor: pointer; padding: 0.5rem 0; }
  form { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.5rem; }
  .err { color: #f85149; max-width: 320px; word-break: break-word; }
  .scanner {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .scanner video { width: 100%; max-height: 80vh; object-fit: cover; }
  .cancel {
    position: absolute;
    bottom: calc(2rem + env(safe-area-inset-bottom));
    background: #b62324;
    padding: 0.75rem 2rem;
  }
</style>
