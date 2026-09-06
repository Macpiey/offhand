<script lang="ts">
  import { voiceAvailable, listen } from '$lib/voice.js';
  import { uploadAttachment } from '$lib/client.js';
  import Icon from './Icon.svelte';

  interface Attachment {
    blobId: string;
    name: string;
    mime: string;
  }

  let {
    busy,
    queued,
    onsubmit,
    onstop,
    modeLabel = '',
    modelLabel = '',
    effortLabel = '',
    ctxPct = null,
    onConfig,
  }: {
    busy: boolean;
    queued: number;
    onsubmit: (text: string, attachments: Attachment[]) => void;
    onstop: () => void;
    modeLabel?: string;
    modelLabel?: string;
    effortLabel?: string;
    ctxPct?: number | null;
    onConfig?: () => void;
  } = $props();

  // Context gauge ring (r=7 → circumference ≈ 44).
  const RING = 2 * Math.PI * 7;

  let text = $state('');
  let listening = $state(false);
  let stopFn: (() => void) | null = null;
  let area = $state<HTMLTextAreaElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let attachments = $state<Attachment[]>([]);
  let uploading = $state(false);
  const hasVoice = voiceAvailable();

  async function onFiles(e: Event): Promise<void> {
    const files = (e.target as HTMLInputElement).files;
    if (!files?.length) return;
    uploading = true;
    try {
      for (const f of files) attachments = [...attachments, await uploadAttachment(f)];
    } catch (err) {
      alert(`Attachment failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      uploading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function autosize(): void {
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = Math.min(area.scrollHeight, 110) + 'px';
  }

  function submit(e?: Event): void {
    e?.preventDefault();
    const t = text.trim();
    if (!t && attachments.length === 0) return;
    onsubmit(t || 'See the attached file(s).', attachments);
    text = '';
    attachments = [];
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
  {/if}
  {#if attachments.length > 0 || uploading}
    <div class="attach-row">
      {#each attachments as a, i (a.blobId)}
        <span class="attach-chip">
          <Icon name={a.mime.startsWith('image/') ? 'camera' : 'copy'} size={12} />
          {a.name}
          <button
            type="button"
            class="rm"
            onclick={() => (attachments = attachments.filter((_, n) => n !== i))}
            aria-label="Remove attachment"><Icon name="x" size={11} /></button>
        </span>
      {/each}
      {#if uploading}<span class="attach-chip dim">Encrypting…</span>{/if}
    </div>
  {/if}
  <form onsubmit={submit}>
    <div class="field">
      <input type="file" multiple hidden bind:this={fileInput} onchange={onFiles} />
      <textarea
        bind:this={area}
        bind:value={text}
        oninput={autosize}
        onkeydown={onKey}
        placeholder={busy ? 'Queue another message…' : 'Message your agent'}
        rows="1"
      ></textarea>
      <div class="controls">
        <button type="button" class="round" onclick={() => fileInput?.click()} aria-label="Attach file">
          <Icon name="plus" size={17} />
        </button>
        {#if onConfig && modeLabel}
          <button type="button" class="pill" onclick={onConfig} aria-label="Permission mode">
            <Icon name="shield" size={12} />{modeLabel}
          </button>
        {/if}
        <span class="spacer"></span>
        {#if onConfig && (modelLabel || ctxPct !== null)}
          <button type="button" class="pill" onclick={onConfig} aria-label="Model and usage">
            {#if ctxPct !== null}
              <svg class="ring" viewBox="0 0 18 18" class:hot={ctxPct > 80}>
                <circle class="bg" cx="9" cy="9" r="7" />
                <circle class="fg" cx="9" cy="9" r="7" stroke-dasharray="{(ctxPct / 100) * RING} {RING}" />
              </svg>
            {/if}
            {modelLabel}{effortLabel ? ` · ${effortLabel}` : ''}
          </button>
        {/if}
        {#if hasVoice}
          <button type="button" class="round" class:listening onclick={toggleVoice} aria-label="Voice input">
            <Icon name="mic" size={16} />
          </button>
        {/if}
        <button type="submit" class="send" disabled={(!text.trim() && attachments.length === 0) || uploading} aria-label="Send">
          <Icon name="send" size={16} stroke={2.2} />
        </button>
      </div>
    </div>
  </form>
</div>

<style>
  .composer {
    flex-shrink: 0;
    padding: 0.35rem 1rem var(--inset-b);
    transition: padding-bottom 0.15s ease-out;
  }
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
    flex-direction: column;
    gap: 0.1rem;
    background: var(--card);
    border: 1px solid var(--hairline-2);
    border-radius: 20px;
    padding: 0.55rem 0.55rem 0.45rem 0.55rem;
    transition: border-color 0.15s ease;
  }
  .field:focus-within { border-color: color-mix(in srgb, var(--brand) 55%, transparent); }
  textarea {
    width: 100%;
    background: none;
    border: none;
    padding: 0.15rem 0.5rem 0.35rem;
    font-size: 15px;
    resize: none;
    max-height: 110px;
    line-height: 1.45;
  }
  .controls { display: flex; align-items: center; gap: 0.3rem; }
  .spacer { flex: 1; }
  .round, .send {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    padding: 0;
    flex-shrink: 0;
  }
  .round { background: transparent; color: var(--mute); }
  .round:active { background: var(--raised); }
  .round.listening { background: var(--risk); color: #fff; animation: pulse 1.3s infinite; }
  .send { background: var(--brand); }
  .pill {
    height: 30px;
    padding: 0 0.7rem;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--hairline);
    color: var(--mute);
    font-size: 11.5px;
    font-weight: 600;
    gap: 0.35rem;
    max-width: 40vw;
    overflow: hidden;
    white-space: nowrap;
  }
  .pill:active { background: var(--bg); color: var(--ink); }
  .ring { width: 15px; height: 15px; transform: rotate(-90deg); flex-shrink: 0; }
  .ring circle { fill: none; stroke-width: 2.6; }
  .ring .bg { stroke: var(--raised); }
  .ring .fg { stroke: var(--brand); stroke-linecap: round; }
  .ring.hot .fg { stroke: var(--warn); }
  .attach-row { display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0 0.25rem 0.5rem; }
  .attach-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--card);
    border: 1px solid var(--hairline-2);
    border-radius: 999px;
    padding: 0.25rem 0.4rem 0.25rem 0.7rem;
    font-size: 12px;
    color: var(--mute);
    max-width: 240px;
    overflow: hidden;
    white-space: nowrap;
  }
  .attach-chip.dim { color: var(--ghost); padding-right: 0.7rem; }
  .rm { width: 20px; height: 20px; padding: 0; border-radius: 50%; background: var(--raised); color: var(--mute); }
</style>
