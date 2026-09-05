<script lang="ts">
  import { pairWithCode } from '$lib/client.js';
  import { scanQR, parseScanned } from '$lib/scanner.js';

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
    <img src="/icons/icon-192.png" alt="" width="64" height="64" />
    <h1>offhand</h1>
    <p class="tagline">Your coding agent, in your pocket —<br />while it runs on your machine.</p>
  </div>

  <div class="steps">
    <div class="step"><span class="num">1</span> On your computer, run <code>npx offhand</code></div>
    <div class="step"><span class="num">2</span> Scan the QR code it shows you</div>
  </div>

  <button class="scan" onclick={startScan}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
    </svg>
    Scan QR code
  </button>

  <details>
    <summary>Enter code manually</summary>
    <form onsubmit={pair}>
      <input placeholder="Pairing code" bind:value={code} autocomplete="off" />
      <input placeholder="Relay URL (optional)" bind:value={relay} autocomplete="off" />
      <button type="submit" disabled={!code.trim()}>Pair</button>
    </form>
  </details>

  {#if errorMsg}<p class="err">{errorMsg}</p>{/if}

  <p class="privacy">🔒 End-to-end encrypted. We can't read your code — cryptographically.</p>
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
    gap: 1.4rem;
    padding: 2rem 1.75rem calc(2rem + env(safe-area-inset-bottom));
    text-align: center;
    min-height: 100dvh;
    box-sizing: border-box;
  }
  .hero { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; }
  .hero img { border-radius: 18px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); }
  h1 { font: 600 30px/1.1 var(--font-display); letter-spacing: -0.02em; margin: 0.25rem 0 0; }
  .tagline { color: var(--muted); margin: 0; font-size: 15px; }
  .steps { display: flex; flex-direction: column; gap: 0.6rem; width: 100%; max-width: 330px; }
  .step {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    text-align: left;
    font-size: 14px;
  }
  .num {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
    font-size: 13px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  code { font-family: var(--font-mono); color: var(--accent); font-size: 13px; }
  .scan {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    max-width: 330px;
    justify-content: center;
    padding: 0.9rem;
    font-size: 15.5px;
  }
  .scan svg { width: 20px; height: 20px; }
  details { width: 100%; max-width: 330px; color: var(--muted); font-size: 13.5px; }
  summary { cursor: pointer; padding: 0.4rem 0; }
  form { display: flex; flex-direction: column; gap: 0.55rem; padding-top: 0.6rem; }
  .err { color: var(--bad); max-width: 330px; word-break: break-word; font-size: 13.5px; margin: 0; }
  .privacy { color: var(--faint); font-size: 12px; margin: 0.5rem 0 0; }
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
    width: min(65vw, 300px);
    aspect-ratio: 1;
    border: 3px solid rgba(255, 255, 255, 0.85);
    border-radius: 24px;
    pointer-events: none;
  }
  .cancel {
    position: absolute;
    bottom: calc(2.5rem + env(safe-area-inset-bottom));
    background: rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(10px);
    padding: 0.8rem 2.5rem;
  }
</style>
