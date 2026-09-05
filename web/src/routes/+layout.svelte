<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { boot } from '$lib/client.js';
  import { conn, waiting } from '$lib/stores.js';
  import PairScreen from '$lib/components/PairScreen.svelte';

  let { children } = $props();
  let bootError = $state('');

  onMount(() => {
    boot().catch((e) => (bootError = e instanceof Error ? e.message : String(e)));
  });

  const tabs = [
    { href: '/', icon: '▤', label: 'Sessions' },
    { href: '/session', icon: '❯', label: 'Chat' },
    { href: '/settings', icon: '⚙', label: 'Settings' },
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
      <span class="dot {$conn.phase === 'connected' ? ($conn.daemonOnline ? 'ok' : 'warn') : 'bad'}"></span>
      <span class="status-text">
        {#if $conn.phase !== 'connected'}
          connecting…
        {:else if !$conn.daemonOnline}
          daemon offline{$conn.lastSeenMs ? ` · last seen ${new Date($conn.lastSeenMs).toLocaleTimeString()}` : ''}
        {:else}
          {$conn.host?.hostname ?? 'connected'} · <span class="sas">🔒 {$conn.sas}</span>
        {/if}
      </span>
    </header>

    <main>
      {@render children()}
    </main>

    <nav>
      {#each tabs as tab (tab.href)}
        <a href={tab.href} class:active={$page.url.pathname === tab.href}>
          <span class="icon">{tab.icon}
            {#if tab.href === '/session' && $waiting.size > 0}<span class="badge">{$waiting.size}</span>{/if}
          </span>
          <span>{tab.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    background: #0d1117;
    color: #e6edf3;
    font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  :global(button) {
    font: inherit;
    border: 0;
    border-radius: 8px;
    background: #238636;
    color: #fff;
    padding: 0.55rem 1rem;
    cursor: pointer;
  }
  :global(input), :global(select) {
    font: inherit;
    background: #161b22;
    color: #e6edf3;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 0.55rem 0.75rem;
  }
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
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 12px;
    color: #8b949e;
    border-bottom: 1px solid #21262d;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot.ok { background: #3fb950; }
  .dot.warn { background: #d29922; }
  .dot.bad { background: #f85149; }
  .status-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sas { color: #3fb950; }
  main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
  nav {
    display: flex;
    border-top: 1px solid #21262d;
    padding-bottom: env(safe-area-inset-bottom);
  }
  nav a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 0.5rem 0 0.4rem;
    color: #8b949e;
    text-decoration: none;
    font-size: 11px;
  }
  nav a.active { color: #58a6ff; }
  .icon { font-size: 18px; position: relative; }
  .badge {
    position: absolute;
    top: -4px;
    right: -12px;
    background: #f85149;
    color: #fff;
    font-size: 10px;
    border-radius: 8px;
    padding: 0 4px;
    line-height: 14px;
  }
</style>
