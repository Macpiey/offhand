<script lang="ts">
  import { drawerOpen, waiting } from '$lib/stores.js';
  import Icon from './Icon.svelte';
</script>

<button class="burger" onclick={() => drawerOpen.set(true)} aria-label="Menu">
  <Icon name="menu" size={19} />
  {#if $waiting.size > 0}<span class="dot"></span>{/if}
</button>

<style>
  .burger {
    position: relative;
    width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--ink);
    flex-shrink: 0;
  }
  .burger:active { background: var(--card); }
  .dot {
    position: absolute;
    top: 7px;
    right: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warn);
    border: 2px solid var(--bg);
  }
  @media (min-width: 700px) {
    .burger { display: none; }
  }
</style>
