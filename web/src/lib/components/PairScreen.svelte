<script lang="ts">
  import { pairWithCode } from '$lib/client.js';
  import { scanQR, parseScanned } from '$lib/scanner.js';
  import Icon from './Icon.svelte';

  let { error = '' }: { error?: string } = $props();

  let code = $state('');
  let relay = $state('');
  let errorMsg = $state('');
  let scanning = $state(false);
  let video = $state<HTMLVideoElement | null>(null);
  let abort: AbortController | null = null;

  $effect(() => {
    if (error) errorMsg = error;
  });

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
  <div class="hero">
    <img src="/icons/icon-192.png" alt="" width="60" height="60" />
    <h1>offhand</h1>
    <p class="tagline">Your coding agent, in your pocket —<br />while it runs on your machine.</p>
  </div>

  <div class="steps">
    <div class="step">
      <span class="num">1</span>
      <span>On your computer, run <code>npx offhand</code></span>
    </div>
    <div class="step">
      <span class="num">2</span>
      <span>Scan the QR code it shows you</span>
    </div>
  </div>

  <button class="scan" onclick={startScan}><Icon name="scan" size={18} />Scan QR code</button>

  <details>
    <summary>Enter code manually</summary>
    <form onsubmit={pair}>
      <input placeholder="Pairing code" bind:value={code} autocomplete="off" />
      <input placeholder="Relay URL · optional" bind:value={relay} autocomplete="off" />
      <button type="submit" disabled={!code.trim()}>Pair</button>
    </form>
  </details>

  {#if errorMsg}<p class="err">{errorMsg}</p>{/if}

  <p class="privacy"><Icon name="lock" size={12} /> End-to-end encrypted. We can't read your code — cryptographically.</p>
</div>

{#if scanning}
  <div class="scanner">
    <video bind:this={video} playsinline muted></video>
    <div class="frame"></div>
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
    gap: 1.35rem;
    padding: 2rem 1.75rem calc(2rem + env(safe-area-inset-bottom));
    text-align: center;
    min-height: 100dvh;
    box-sizing: border-box;
  }
  .hero { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .hero img { border-radius: 15px; }
  h1 { font: 700 26px/1.1 var(--font-display); letter-spacing: -0.01em; margin: 0.3rem 0 0; }
  .tagline { color: var(--muted); margin: 0; font-size: 14.5px; line-height: 1.55; }
  .steps { display: flex; flex-direction: column; gap: 0.55rem; width: 100%; max-width: 330px; }
  .step {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 0.75rem 1rem;
    text-align: left;
    font-size: 13.5px;
  }
  .num {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-hover);
    font-weight: 700;
    font-size: 12px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  code { font-family: var(--font-mono); color: var(--accent-hover); font-size: 12.5px; }
  .scan { width: 100%; max-width: 330px; height: 46px; font-size: 15px; }
  details { width: 100%; max-width: 330px; color: var(--muted); font-size: 13px; }
  summary { cursor: pointer; padding: 0.35rem 0; }
  form { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.55rem; }
  .err { color: var(--bad); max-width: 330px; word-break: break-word; font-size: 13px; margin: 0; }
  .privacy {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--faint);
    font-size: 11.5px;
    margin: 0.4rem 0 0;
  }
  .scanner {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .scanner video { width: 100%; max-height: 100vh; object-fit: cover; }
  .frame {
    position: absolute;
    width: min(65vw, 290px);
    aspect-ratio: 1;
    border: 2.5px solid rgba(255, 255, 255, 0.85);
    border-radius: 22px;
    pointer-events: none;
  }
  .cancel {
    position: absolute;
    bottom: calc(2.5rem + env(safe-area-inset-bottom));
    background: rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(10px);
  }
</style>
