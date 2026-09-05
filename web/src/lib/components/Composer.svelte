<script lang="ts">
  import { voiceAvailable, listen } from '$lib/voice.js';

  let { busy, queued, onsubmit }: { busy: boolean; queued: number; onsubmit: (text: string) => void } =
    $props();

  let text = $state('');
  let listening = $state(false);
  let stopFn: (() => void) | null = null;
  const hasVoice = voiceAvailable();

  const chips = ['Run the tests', 'Fix it', 'Show me a screenshot', 'Commit the changes'];

  function submit(e?: Event): void {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    onsubmit(t);
    text = '';
  }

  function toggleVoice(): void {
    if (listening) {
      stopFn?.();
      listening = false;
      return;
    }
    listening = true;
    const base = text;
    stopFn = listen((spoken, final) => {
      if (final) {
        listening = false;
        return;
      }
      text = base ? `${base} ${spoken}` : spoken;
    });
  }
</script>

<div class="composer">
  {#if busy}
    <div class="working"><span class="pulse"></span>agent working{queued > 0 ? ` · ${queued} queued` : ''}</div>
  {:else}
    <div class="chips">
      {#each chips as chip (chip)}
        <button class="chip" onclick={() => onsubmit(chip)}>{chip}</button>
      {/each}
    </div>
  {/if}
  <form onsubmit={submit}>
    <div class="field">
      <input placeholder="Message your agent…" bind:value={text} autocomplete="off" />
      {#if hasVoice}
        <button type="button" class="mic" class:listening onclick={toggleVoice} aria-label="Voice input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      {/if}
      <button type="submit" class="send" disabled={!text.trim()} aria-label="Send">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  </form>
</div>

<style>
  .composer { padding: 0.4rem 1rem calc(0.75rem + env(safe-area-inset-bottom)); }
  .chips { display: flex; gap: 0.45rem; overflow-x: auto; padding-bottom: 0.55rem; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip {
    background: var(--surface);
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 500;
    padding: 0.35rem 0.9rem;
    white-space: nowrap;
  }
  .working {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--accent);
    font-size: 12.5px;
    font-weight: 600;
    padding: 0.15rem 0.25rem 0.6rem;
  }
  .pulse { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: pulse 1.3s infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .field {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 0.3rem 0.4rem 0.3rem 1.1rem;
  }
  .field:focus-within { border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
  input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0.45rem 0;
    font-size: 15px;
  }
  .mic, .send {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    padding: 0;
    display: grid;
    place-items: center;
  }
  .mic { background: transparent; color: var(--muted); }
  .mic svg, .send svg { width: 19px; height: 19px; }
  .mic.listening { background: var(--bad); color: #fff; animation: pulse 1.3s infinite; }
  .send { background: var(--accent); }
</style>
