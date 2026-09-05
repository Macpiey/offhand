<script lang="ts">
  import { conn, justPaired } from '$lib/stores.js';
  import { unpair } from '$lib/client.js';
  import Icon from './Icon.svelte';
</script>

<div class="scrim"></div>
<div class="verify" role="dialog" aria-label="Verify pairing">
  <div class="check"><Icon name="check" size={24} stroke={2.2} /></div>
  <h1>Paired</h1>
  <p>One last check — does this code match the one on your computer's terminal?</p>
  <div class="sas">{$conn.sas.replaceAll('-', '\u2002')}</div>
  <button onclick={() => justPaired.set(false)}>They match</button>
  <button
    class="differ"
    onclick={() => {
      if (confirm('If the codes differ, someone may be intercepting. Unpair now?')) unpair();
      else justPaired.set(false);
    }}
  >They don't match</button>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 50; background: var(--bg); }
  .verify {
    position: fixed;
    inset: 0;
    z-index: 51;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.1rem;
    padding: calc(var(--inset-t) + 1rem) 1.75rem calc(var(--inset-b) + 1rem);
    text-align: center;
  }
  .check {
    width: 62px;
    height: 62px;
    border-radius: 50%;
    background: var(--ok-soft);
    color: var(--ok);
    display: grid;
    place-items: center;
  }
  h1 { font: 700 24px/1.2 var(--serif); margin: 0; }
  p { color: var(--mute); max-width: 300px; margin: 0; font-size: 14.5px; line-height: 1.55; }
  .sas {
    font: 600 19px/1 var(--mono);
    color: var(--ok);
    background: var(--card);
    border: 1px solid var(--hairline-2);
    border-radius: var(--r-card);
    padding: 1.05rem 1.3rem;
    letter-spacing: 0.04em;
  }
  button { width: 100%; max-width: 340px; height: 48px; }
  .differ { background: none; color: var(--ghost); font-weight: 500; height: 40px; }
  .differ:active { background: none; }
</style>
