<script lang="ts">
  import { voiceAvailable, listen } from '$lib/voice.js';
  import Icon from './Icon.svelte';

  let {
    busy,
    queued,
    onsubmit,
    onstop,
  }: {
    busy: boolean;
    queued: number;
    onsubmit: (text: string) => void;
    onstop: () => void;
  } = $props();

  let text = $state('');
  let listening = $state(false);
  let stopFn: (() => void) | null = null;
  let area = $state<HTMLTextAreaElement | null>(null);
  const hasVoice = voiceAvailable();

  const chips = ['Run the tests', 'Fix it', 'Show me a screenshot', 'Commit the changes'];

  function autosize(): void {
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = Math.min(area.scrollHeight, 110) + 'px';
  }

  function submit(e?: Event): void {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    onsubmit(t);
    text = '';
    requestAnimationFrame(autosize);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
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
      requestAnimationFrame(autosize);
    });
  }
</script>

<div class="composer">
  {#if busy}
    <div class="working">
      <span class="pulse"></span>
      <span class="w-text">Agent working{queued > 0 ? ` · ${queued} queued` : ''}</span>
      <button class="stop" onclick={onstop}><Icon name="stop" size={12} />Stop</button>
    </div>
  {:else}
    <div class="chips">
      {#each chips as chip (chip)}
        <button class="chip" onclick={() => onsubmit(chip)}>{chip}</button>
      {/each}
    </div>
  {/if}
  <form onsubmit={submit}>
    <div class="field">
      <textarea
        bind:this={area}
        bind:value={text}
        oninput={autosize}
        onkeydown={onKey}
        placeholder={busy ? 'Queue another message…' : 'Message your agent'}
        rows="1"
      ></textarea>
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
  .composer {
    flex-shrink: 0;
    padding: 0.35rem 1rem calc(var(--inset-b) + var(--kb, 0px));
    transition: padding-bottom 0.15s ease-out;
  }
  .chips { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.5rem; }
  .chip {
    height: 30px;
    background: transparent;
    border: 1px solid var(--hairline-2);
    color: var(--mute);
    font-size: 12px;
    font-weight: 500;
    padding: 0 0.85rem;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .chip:active { background: var(--card); color: var(--ink); }
  .working {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 0.25rem 0.55rem;
  }
  .w-text { color: var(--mute); font-size: 12.5px; font-weight: 500; flex: 1; }
  .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); animation: pulse 1.3s infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }
  .stop {
    height: 28px;
    padding: 0 0.7rem;
    background: var(--raised);
    color: var(--mute);
    border: 1px solid var(--hairline-2);
    font-size: 11.5px;
    gap: 0.3rem;
  }
  .field {
    display: flex;
    align-items: flex-end;
    gap: 0.35rem;
    background: var(--card);
    border: 1px solid var(--hairline-2);
    border-radius: 22px;
    padding: 0.3rem 0.35rem 0.3rem 1rem;
    transition: border-color 0.15s ease;
  }
  .field:focus-within { border-color: color-mix(in srgb, var(--brand) 55%, transparent); }
  textarea {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0.5rem 0;
    font-size: 15px;
    resize: none;
    max-height: 110px;
    line-height: 1.45;
  }
  .mic, .send {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    padding: 0;
    flex-shrink: 0;
  }
  .mic { background: transparent; color: var(--mute); }
  .mic:active { background: var(--raised); }
  .mic.listening { background: var(--risk); color: #fff; animation: pulse 1.3s infinite; }
  .send { background: var(--brand); }
</style>
