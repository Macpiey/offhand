<script lang="ts">
  import { pairWithCode } from '$lib/client.js';
  import { scanQR, parseScanned } from '$lib/scanner.js';
  import Icon from './Icon.svelte';

  let { error = '' }: { error?: string } = $props();

  let code = $state('');
  let relay = $state('');
  let errorMsg = $state('');
  let scanning = $state(false);
  let manual = $state(false);
  let copied = $state(false);
  let video = $state<HTMLVideoElement | null>(null);
  let abort: AbortController | null = null;

  $effect(() => {
    if (error) errorMsg = error;
  });

  async function doPair(c: string, r?: string): Promise<void> {
    await pairWithCode(c, r); // success → layout shows the verify ritual
    if ('vibrate' in navigator) navigator.vibrate?.(10);
  }

  async function pairManual(e?: Event): Promise<void> {
    e?.preventDefault();
    errorMsg = '';
    try {
      await doPair(code, relay || undefined);
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
      await doPair(parsed.code, parsed.relay);
    } catch (err) {
      scanning = false;
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        manual = true;
        errorMsg = 'Camera unavailable — enter the code instead.';
      } else {
        errorMsg = err instanceof Error ? err.message : String(err);
      }
    }
  }

  function cancelScan(): void {
    abort?.abort();
    scanning = false;
  }

  async function copyCmd(): Promise<void> {
    try {
      await navigator.clipboard.writeText('npx offhand');
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* ignore */
    }
  }
</script>

<div class="pair">
    <div class="hero">
      <img src="/icons/icon-192.png" alt="" width="56" height="56" />
      <h1>Connect your computer</h1>
    </div>

    <div class="steps">
      <div class="step">
        <span class="num">1</span>
        <span class="grow">On your computer, run <code>npx offhand</code></span>
        <button class="copy" onclick={copyCmd} aria-label="Copy command">
          <Icon name={copied ? 'check' : 'copy'} size={14} />
        </button>
      </div>
      <div class="step">
        <span class="num">2</span>
        <span class="grow">A QR code appears in the terminal</span>
      </div>
    </div>

    <button class="scan" onclick={startScan}><Icon name="scan" size={18} />Scan QR code</button>

    {#if manual}
      <form onsubmit={pairManual}>
        <input placeholder="Pairing code" bind:value={code} autocomplete="off" />
        <input placeholder="Relay URL · optional" bind:value={relay} autocomplete="off" />
        <button type="submit" disabled={!code.trim()}>Pair</button>
      </form>
    {:else}
      <button class="link" onclick={() => (manual = true)}>Type code instead</button>
    {/if}

    {#if errorMsg}<p class="err">{errorMsg}</p>{/if}

    <p class="privacy"><Icon name="lock" size={12} /> End-to-end encrypted. We can't read your code.</p>
  </div>

{#if scanning}
  <div class="scanner">
    <video bind:this={video} playsinline muted></video>
    <p class="scan-hint">Point at the QR in your terminal</p>
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
    gap: 1.2rem;
    padding: calc(var(--inset-t) + 1rem) 1.75rem calc(var(--inset-b) + 1rem);
    text-align: center;
  }
  .hero { display: flex; flex-direction: column; align-items: center; gap: 0.8rem; }
  .hero img { border-radius: 14px; }
  h1 { font: 700 24px/1.2 var(--serif); letter-spacing: -0.02em; margin: 0; }
  .steps { display: flex; flex-direction: column; gap: 0.55rem; width: 100%; max-width: 340px; }
  .step {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    padding: 0.8rem 0.7rem 0.8rem 1rem;
    text-align: left;
    font-size: 14px;
  }
  .grow { flex: 1; }
  .num {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--brand-soft);
    color: var(--brand);
    font-weight: 700;
    font-size: 12px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  code { font-family: var(--mono); color: var(--brand); font-size: 12.5px; }
  .copy { width: 30px; height: 30px; padding: 0; background: var(--raised); color: var(--mute); border-radius: 8px; }
  .scan { width: 100%; max-width: 340px; height: 48px; font-size: 15px; }
  .link { background: none; color: var(--mute); height: 36px; font-weight: 500; }
  .link:active { background: none; }
  form { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; max-width: 340px; }
  .err { color: var(--risk); max-width: 340px; word-break: break-word; font-size: 13px; margin: 0; }
  .privacy {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--ghost);
    font-size: 11.5px;
    margin: 0.4rem 0 0;
  }

  .scanner {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .scanner video { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
  .scan-hint {
    position: absolute;
    top: calc(var(--inset-t) + 2.5rem);
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    font-weight: 500;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  }
  .frame {
    position: absolute;
    width: min(64vw, 280px);
    aspect-ratio: 1;
    border: 2.5px solid rgba(255, 255, 255, 0.9);
    border-radius: 20px;
    pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  }
  .cancel {
    position: absolute;
    bottom: calc(var(--inset-b) + 2rem);
    background: rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(10px);
    padding: 0 2.2rem;
  }
</style>
