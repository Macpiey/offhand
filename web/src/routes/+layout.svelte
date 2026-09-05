<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { boot } from '$lib/client.js';
  import { conn, waiting } from '$lib/stores.js';
  import PairScreen from '$lib/components/PairScreen.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let { children } = $props();
  let bootError = $state('');

  onMount(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    boot().catch((e) => (bootError = e instanceof Error ? e.message : String(e)));
  });

  const tabs = [
    { href: '/', label: 'Sessions', icon: 'sessions' },
    { href: '/session', label: 'Chat', icon: 'chat' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];
</script>

<svelte:head>
  <meta name="color-scheme" content="dark" />
</svelte:head>

<div class="app">
  {#if $conn.phase === 'unpaired'}
    <PairScreen error={bootError} />
  {:else}
    <header>
      <span class="brand">offhand</span>
      <span class="conn" class:off={$conn.phase !== 'connected' || !$conn.daemonOnline}>
        <span class="dot"></span>
        {#if $conn.phase !== 'connected'}
          Connecting
        {:else if !$conn.daemonOnline}
          Daemon offline
        {:else}
          {$conn.host?.hostname ?? 'Connected'}
        {/if}
      </span>
    </header>

    <main>
      {@render children()}
    </main>

    <nav>
      {#each tabs as tab (tab.href)}
        <a href={tab.href} class:active={$page.url.pathname === tab.href} aria-label={tab.label}>
          <span class="icon-wrap">
            <Icon name={tab.icon} size={21} />
            {#if tab.href === '/session' && $waiting.size > 0}<span class="badge">{$waiting.size}</span>{/if}
          </span>
          <span class="tab-label">{tab.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
</div>

<style>
  :global(:root) {
    --bg: #1f1e1c;
    --surface: #292826;
    --surface-2: #343330;
    --hairline: rgba(240, 238, 230, 0.08);
    --hairline-strong: rgba(240, 238, 230, 0.14);
    --text: #ececea;
    --muted: #9d9a93;
    --faint: #6f6d67;
    --accent: #cc6b4d;
    --accent-hover: #d97757;
    --accent-soft: rgba(204, 107, 77, 0.12);
    --ok: #6faf6a;
    --ok-soft: rgba(111, 175, 106, 0.1);
    --warn: #cf9b3e;
    --warn-soft: rgba(207, 155, 62, 0.1);
    --bad: #d4685a;
    --bad-soft: rgba(212, 104, 90, 0.1);
    --r-lg: 14px;
    --r-md: 10px;
    --r-sm: 8px;
    --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;
    --font-display: ui-serif, Georgia, serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  :global(*) { -webkit-tap-highlight-color: transparent; }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 400 15px/1.5 var(--font-body);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  :global(::-webkit-scrollbar) { width: 0; height: 0; }
  :global(*) { scrollbar-width: none; }
  :global(button) {
    font: 600 14px/1 var(--font-body);
    border: 0;
    border-radius: var(--r-md);
    background: var(--accent);
    color: #fff;
    height: 40px;
    padding: 0 1.1rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    transition: background 0.15s ease, opacity 0.15s ease, transform 0.05s ease;
  }
  :global(button:hover) { background: var(--accent-hover); }
  :global(button:active) { transform: scale(0.985); }
  :global(button:disabled) { opacity: 0.4; pointer-events: none; }
  :global(input), :global(select) {
    font: 400 15px/1.4 var(--font-body);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    padding: 0.6rem 0.85rem;
    outline: none;
    transition: border-color 0.15s ease;
  }
  :global(input:focus), :global(select:focus) { border-color: var(--accent); }
  :global(input::placeholder) { color: var(--faint); }

  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    max-width: 760px;
    margin: 0 auto;
    padding-top: env(safe-area-inset-top);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 1.25rem 0.55rem;
  }
  .brand {
    font: 700 17px/1 var(--font-display);
    letter-spacing: -0.01em;
  }
  .conn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 0.28rem 0.75rem;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); }
  .conn.off .dot { background: var(--warn); }

  main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }

  nav {
    display: flex;
    padding: 0.3rem 1.25rem calc(0.3rem + env(safe-area-inset-bottom));
    border-top: 1px solid var(--hairline);
    background: color-mix(in srgb, var(--bg) 92%, black);
  }
  nav a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 0.5rem 0 0.35rem;
    color: var(--faint);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  nav a.active { color: var(--text); }
  .icon-wrap { position: relative; display: grid; place-items: center; height: 22px; }
  .tab-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.01em; }
  .badge {
    position: absolute;
    top: -4px;
    right: -11px;
    background: var(--accent);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    border-radius: 8px;
    padding: 0 4.5px;
    line-height: 15px;
  }
</style>
