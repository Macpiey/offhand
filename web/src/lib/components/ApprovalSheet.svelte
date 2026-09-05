<script lang="ts">
  import type { TranscriptItem } from '$lib/stores.js';
  import { answerApproval } from '$lib/client.js';
  import Icon from './Icon.svelte';

  let {
    sessionId,
    approval,
  }: {
    sessionId: string;
    approval: Extract<TranscriptItem, { kind: 'approval' }>;
  } = $props();

  const high = $derived(approval.risk === 'high');

  // High-risk: hold-to-approve (800ms) — deliberate friction.
  let holding = $state(false);
  let progress = $state(0);
  let raf: number | null = null;
  let holdStart = 0;

  function beginHold(): void {
    if (!high) return;
    holding = true;
    holdStart = performance.now();
    const tick = () => {
      progress = Math.min(1, (performance.now() - holdStart) / 800);
      if (progress >= 1) {
        holding = false;
        if ('vibrate' in navigator) navigator.vibrate?.(25);
        answerApproval(sessionId, approval.approvalId, true);
        return;
      }
      if (holding) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function endHold(): void {
    holding = false;
    progress = 0;
    if (raf) cancelAnimationFrame(raf);
  }

  function approveTap(): void {
    if (high) return; // high risk requires hold
    if ('vibrate' in navigator) navigator.vibrate?.(12);
    answerApproval(sessionId, approval.approvalId, true);
  }
</script>

<div class="scrim"></div>
<div class="sheet" class:high role="dialog" aria-label="Approval required">
  <div class="handle"></div>
  <div class="head">
    <span class="tile" class:high><Icon name={high ? 'alert' : 'lock'} size={17} /></span>
    <div class="copy">
      <div class="title">{high ? 'High-risk action' : 'Permission needed'}</div>
      <div class="action">{approval.action}</div>
    </div>
  </div>
  <div class="detail">{approval.detail}</div>

  {#if approval.preview}
    <pre class="preview">{#each approval.preview.split('\n') as line, i (i)}<span
          class:add={line.startsWith('+')}
          class:del={line.startsWith('-')}
          class:cmd={line.startsWith('$')}>{line}
</span>{/each}</pre>
  {/if}

  <div class="actions">
    <button class="deny" onclick={() => answerApproval(sessionId, approval.approvalId, false)}>Deny</button>
    {#if high}
      <button
        class="approve hold"
        onpointerdown={beginHold}
        onpointerup={endHold}
        onpointerleave={endHold}
        oncontextmenu={(e) => e.preventDefault()}
      >
        <span class="fill" style="width: {progress * 100}%"></span>
        <span class="lbl">{holding ? 'Keep holding…' : 'Hold to approve'}</span>
      </button>
    {:else}
      <button class="approve" onclick={approveTap}>Approve</button>
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(0, 0, 0, 0.45);
    animation: fade 0.15s ease-out;
  }
  @keyframes fade { from { opacity: 0; } }
  .sheet {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 0;
    z-index: 31;
    width: 100%;
    max-width: 560px;
    background: var(--card);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    border-top: 1px solid var(--hairline-2);
    padding: 0.55rem 1.3rem calc(var(--inset-b) + 0.9rem);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: rise 0.26s cubic-bezier(0.2, 0.9, 0.3, 1);
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.4);
  }
  @keyframes rise { from { transform: translate(-50%, 56px); opacity: 0.4; } }
  .sheet.high { border-top-color: color-mix(in srgb, var(--risk) 55%, transparent); }
  .handle { width: 36px; height: 4px; border-radius: 2px; background: var(--hairline-2); align-self: center; }
  .head { display: flex; align-items: center; gap: 0.75rem; }
  .tile {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: var(--warn-soft);
    color: var(--warn);
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .tile.high { background: var(--risk-soft); color: var(--risk); }
  .title { font-weight: 700; font-size: 16px; }
  .action { color: var(--mute); font-size: 12.5px; margin-top: 1px; }
  .detail {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--mute);
    word-break: break-all;
    line-height: 1.5;
  }
  .preview {
    margin: 0;
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: var(--r-ctl);
    padding: 0.6rem 0.8rem;
    font: 11.5px/1.55 var(--mono);
    max-height: 30dvh;
    overflow: auto;
  }
  .preview span { display: block; white-space: pre-wrap; word-break: break-all; }
  .preview .add { color: var(--ok); }
  .preview .del { color: var(--risk); }
  .preview .cmd { color: var(--warn); }
  .actions { display: flex; gap: 0.6rem; }
  .deny {
    flex: 1;
    height: 50px;
    background: var(--raised);
    color: var(--ink);
    border: 1px solid var(--hairline-2);
    font-size: 15px;
  }
  .deny:active { background: var(--raised); border-color: var(--risk); color: var(--risk); }
  .approve { flex: 1.4; height: 50px; background: var(--ok); font-size: 15px; position: relative; overflow: hidden; }
  .approve:active { background: var(--ok); }
  .approve.hold { background: var(--risk-soft); color: var(--risk); border: 1px solid color-mix(in srgb, var(--risk) 45%, transparent); }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--risk) 35%, transparent);
    transition: width 0.05s linear;
  }
  .lbl { position: relative; }
</style>
