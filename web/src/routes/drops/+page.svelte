<script lang="ts">
  import { drops, type DropItem } from '$lib/stores.js';
  import { fetchArtifact, sendDrop } from '$lib/client.js';
  import Icon from '$lib/components/Icon.svelte';

  let fileInput = $state<HTMLInputElement | null>(null);
  let busySeq = $state<number | null>(null);
  let pendingBlobId = $state('');
  let sendStatus = $state('');
  let error = $state('');
  let noteOpen = $state(false);
  let noteText = $state('');
  let previews = $state<Map<number, string>>(new Map());

  async function sendNote(): Promise<void> {
    const text = noteText.trim();
    if (!text) return;
    error = '';
    sendStatus = 'Sending note…';
    try {
      const stamp = new Date().toTimeString().slice(0, 5).replace(':', '');
      const file = new File([text], `note-${stamp}.txt`, { type: 'text/plain' });
      const uploaded = await sendDrop(file);
      pendingBlobId = uploaded.blobId;
      sendStatus = 'Sent. Waiting for PC confirmation…';
      noteText = '';
      noteOpen = false;
    } catch (e) {
      sendStatus = '';
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const isText = (d: DropItem) => d.mime.startsWith('text/') && d.size < 65_536;

  async function togglePreview(drop: DropItem): Promise<void> {
    const next = new Map(previews);
    if (next.has(drop.seq)) {
      next.delete(drop.seq);
    } else {
      const bytes = await fetchArtifact(drop.blobId);
      next.set(drop.seq, new TextDecoder().decode(bytes));
    }
    previews = next;
  }

  async function copyText(drop: DropItem): Promise<void> {
    const text = previews.get(drop.seq) ?? new TextDecoder().decode(await fetchArtifact(drop.blobId));
    await navigator.clipboard.writeText(text);
    sendStatus = 'Copied to clipboard.';
    setTimeout(() => (sendStatus = ''), 1500);
  }

  const sortedDrops = $derived([...$drops].sort((a, b) => b.seq - a.seq));

  $effect(() => {
    if (!pendingBlobId) return;
    const confirmed = $drops.find((d) => d.direction === 'to-pc' && d.blobId === pendingBlobId);
    if (confirmed) {
      sendStatus = `Saved on your PC as ${confirmed.name}.`;
      pendingBlobId = '';
    }
  });

  async function chooseFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    error = '';
    sendStatus = `Sending ${file.name}…`;
    try {
      const uploaded = await sendDrop(file);
      pendingBlobId = uploaded.blobId;
      sendStatus = `Sent ${file.name}. Waiting for PC confirmation…`;
      input.value = '';
    } catch (e) {
      sendStatus = '';
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function download(drop: DropItem): Promise<void> {
    if (drop.direction !== 'to-phone') return;
    busySeq = drop.seq;
    error = '';
    try {
      const blob = await dropBlob(drop);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = drop.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busySeq = null;
    }
  }

  async function share(drop: DropItem): Promise<void> {
    if (drop.direction !== 'to-phone' || !navigator.share) return;
    busySeq = drop.seq;
    error = '';
    try {
      const blob = await dropBlob(drop);
      const file = new File([blob], drop.name, { type: drop.mime || 'application/octet-stream' });
      if ('canShare' in navigator && !navigator.canShare({ files: [file] })) {
        await download(drop);
        return;
      }
      await navigator.share({ files: [file], title: drop.name });
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') error = e instanceof Error ? e.message : String(e);
    } finally {
      busySeq = null;
    }
  }

  async function dropBlob(drop: DropItem): Promise<Blob> {
    const bytes = await fetchArtifact(drop.blobId);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: drop.mime || 'application/octet-stream' });
  }

  function prettyBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = n / 1024;
    for (const unit of units) {
      if (value < 1024 || unit === 'GB') return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
      value /= 1024;
    }
    return `${n} B`;
  }

  function time(ms: number): string {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="page">
  <section class="send-card">
    <div>
      <span class="eyebrow">Phone → PC</span>
      <p>Files land in Downloads\offhand · short notes go straight to the PC clipboard.</p>
    </div>
    <input bind:this={fileInput} class="hidden" type="file" onchange={chooseFile} />
    <div class="send-row">
      <button onclick={() => fileInput?.click()}><Icon name="send" size={15} />Send a file</button>
      <button class="ghost" onclick={() => (noteOpen = !noteOpen)}><Icon name="copy" size={15} />Send text</button>
    </div>
    {#if noteOpen}
      <textarea rows="3" placeholder="Paste or type — arrives on your PC clipboard" bind:value={noteText}></textarea>
      <button class="note-send" disabled={!noteText.trim()} onclick={sendNote}>Send to PC</button>
    {/if}
    {#if sendStatus}<p class="status ok">{sendStatus}</p>{/if}
    {#if error}<p class="status warn">{error}</p>{/if}
  </section>

  <section>
    <span class="eyebrow">Recent</span>
    {#if sortedDrops.length === 0}
      <div class="empty">
        <Icon name="inbox" size={22} />
        <p>No drops yet.</p>
      </div>
    {:else}
      <div class="list">
        {#each sortedDrops as drop (drop.seq)}
          <article class="card" class:sent={drop.direction === 'to-pc'}>
            <button
              class="main"
              onclick={() => void download(drop)}
              disabled={drop.direction !== 'to-phone' || busySeq === drop.seq}
            >
              <span class="icon"><Icon name={drop.direction === 'to-phone' ? 'inbox' : 'copy'} size={17} /></span>
              <span class="meta">
                <strong>{drop.name}</strong>
                <span>{prettyBytes(drop.size)} · {drop.mime || 'application/octet-stream'} · {time(drop.atMs)}</span>
              </span>
              <span class="pill">{drop.direction === 'to-phone' ? 'Received' : 'Sent'}</span>
            </button>
            {#if drop.direction === 'to-phone' && typeof navigator.share === 'function'}
              <button class="share" onclick={() => void share(drop)} disabled={busySeq === drop.seq}>Share</button>
            {/if}
            {#if isText(drop)}
              <button class="share" onclick={() => void togglePreview(drop)}>{previews.has(drop.seq) ? 'Hide' : 'View'}</button>
              <button class="share" onclick={() => void copyText(drop)}>Copy</button>
            {/if}
            {#if previews.has(drop.seq)}
              <pre class="preview">{previews.get(drop.seq)}</pre>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .page { padding: 0.4rem 1.25rem 2rem; display: flex; flex-direction: column; gap: 1rem; }
  .send-card p { margin: 0.25rem 0 0; color: var(--mute); font-size: 13.5px; }
  .send-row { display: flex; gap: 0.5rem; }
  .send-row button { flex: 1; height: 44px; border-radius: 12px; }
  .ghost { background: var(--bg); border: 1px solid var(--hairline-2); color: var(--ink); }
  .ghost:active { background: var(--bg); }
  .note-send { height: 44px; border-radius: 12px; }
  .preview {
    grid-column: 1 / -1;
    width: 100%;
    margin: 0.4rem 0 0;
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
    font: 12px/1.55 var(--mono);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 40dvh;
    overflow-y: auto;
  }
  .eyebrow {
    color: var(--ghost);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  .send-card, .empty, .card {
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
  }
  .send-card { padding: 1rem; display: flex; flex-direction: column; gap: 0.85rem; }
  .hidden { display: none; }
  .status { font-size: 12.5px; margin: -0.25rem 0 0; }
  .status.ok { color: var(--ok); }
  .status.warn { color: var(--warn); }
  .empty { display: grid; place-items: center; gap: 0.35rem; padding: 2.3rem 1rem; color: var(--ghost); }
  .empty p { margin: 0; }
  .list { display: flex; flex-direction: column; gap: 0.55rem; margin-top: 0.5rem; }
  .card { padding: 0.35rem; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .main {
    flex: 1;
    min-width: 0;
    height: auto;
    min-height: 54px;
    justify-content: flex-start;
    background: transparent;
    color: var(--ink);
    padding: 0.4rem 0.55rem;
    gap: 0.65rem;
  }
  .main:active { background: var(--raised); }
  .main:disabled { opacity: 1; pointer-events: none; }
  .icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    background: var(--brand-soft);
    color: var(--brand);
    flex-shrink: 0;
  }
  .sent .icon { background: var(--ok-soft); color: var(--ok); }
  .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.12rem; text-align: left; }
  .meta strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .meta span { color: var(--ghost); font: 500 11.5px/1.35 var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill {
    border-radius: 999px;
    background: var(--raised);
    color: var(--mute);
    font-size: 10.5px;
    font-weight: 700;
    padding: 0.18rem 0.5rem;
  }
  .share { height: 36px; background: var(--raised); color: var(--ink); font-size: 12px; padding: 0 0.7rem; }
</style>
