<script lang="ts">
  import { voiceAvailable, listen } from '$lib/voice.js';

  let { busy, queued, onsubmit }: { busy: boolean; queued: number; onsubmit: (text: string) => void } =
    $props();

  let text = $state('');
  let listening = $state(false);
  let stopFn: (() => void) | null = null;
  const hasVoice = voiceAvailable();

  const chips = ['run the tests', 'fix it', 'show me a screenshot', 'commit the changes'];

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
  <div class="chips">
    {#each chips as chip (chip)}
      <button class="chip" onclick={() => onsubmit(chip)}>{chip}</button>
    {/each}
  </div>
  <form onsubmit={submit}>
    {#if hasVoice}
      <button type="button" class="mic" class:listening onclick={toggleVoice} title="Voice input">🎤</button>
    {/if}
    <input
      placeholder={busy ? `agent working… (${queued} queued — prompts run in order)` : 'Prompt your agent…'}
      bind:value={text}
      autocomplete="off"
    />
    <button type="submit" disabled={!text.trim()}>Send</button>
  </form>
</div>

<style>
  .composer {
    border-top: 1px solid #21262d;
    padding: 0.5rem 0.75rem calc(0.6rem + env(safe-area-inset-bottom));
  }
  .chips { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.5rem; }
  .chip {
    background: #21262d;
    color: #8b949e;
    font-size: 11px;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  form { display: flex; gap: 0.5rem; }
  input { flex: 1; min-width: 0; }
  .mic { background: #21262d; padding: 0.55rem 0.7rem; }
  .mic.listening { background: #b62324; animation: pulse 1.2s infinite; }
  @keyframes pulse { 50% { opacity: 0.6; } }
</style>
