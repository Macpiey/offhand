<script lang="ts">
  import { voiceAvailable, listen } from '$lib/voice.js';
  import Icon from './Icon.svelte';

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
    <div class="working"><span class="pulse"></span>Agent working{queued > 0 ? ` · ${queued} queued` : ''}</div>
  {:else}
    <div class="chips">
      {#each chips as chip (chip)}
        <button class="chip" onclick={() => onsubmit(chip)}>{chip}</button>
      {/each}
    </div>
  {/if}
  <form onsubmit={submit}>
    <div class="field">
      <input placeholder="Message your agent" bind:value={text} autocomplete="off" />
      {#if hasVoice}
        <button type="button" class="mic" class:listening onclick={toggleVoice} aria-label="Voice input">
          <Icon name="mic" size={17} />
        </button>
      {/if}
      <button type="submit" class="send" disabled={!text.trim()} aria-label="Send">
        <Icon name="send" size={17} stroke={2.2} />
      </button>
    </div>
  </form>
</div>

<style>
  .composer { padding: 0.35rem 1rem calc(0.7rem + env(safe-area-inset-bottom)); }
  .chips { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.5rem; }
  .chip {
    height: 30px;
    background: transparent;
    border: 1px solid var(--hairline-strong);
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
    padding: 0 0.85rem;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .chip:hover { background: var(--surface); color: var(--text); }
  .working {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 500;
    padding: 0.2rem 0.25rem 0.6rem;
  }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.3s infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .field {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--surface);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-lg);
    padding: 0.3rem 0.35rem 0.3rem 1rem;
    transition: border-color 0.15s ease;
  }
  .field:focus-within { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
  input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0.5rem 0;
    font-size: 15px;
  }
  .mic, .send {
    width: 36px;
    height: 36px;
    border-radius: var(--r-md);
    padding: 0;
    flex-shrink: 0;
  }
  .mic { background: transparent; color: var(--muted); }
  .mic:hover { background: var(--surface-2); }
  .mic.listening { background: var(--bad); color: #fff; animation: pulse 1.3s infinite; }
  .send { background: var(--accent); }
</style>
