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
    { href: '/', label: 'Sessions', d: 'M4 6h16M4 12h16M4 18h10' },
    { href: '/session', label: 'Chat', d: 'M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z' },
    { href: '/settings', label: 'Settings', d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3a8 8 0 0 1-.2 1.7l2 1.6-2 3.4-2.4-1a8 8 0 0 1-2.9 1.7L14 22h-4l-.5-2.6a8 8 0 0 1-2.9-1.7l-2.4 1-2-3.4 2-1.6A8 8 0 0 1 4 12c0-.6.1-1.1.2-1.7l-2-1.6 2-3.4 2.4 1a8 8 0 0 1 2.9-1.7L10 2h4l.5 2.6a8 8 0 0 1 2.9 1.7l2.4-1 2 3.4-2 1.6c.1.6.2 1.1.2 1.7z' },
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
      <span class="conn">
        <span class="dot {$conn.phase === 'connected' ? ($conn.daemonOnline ? 'ok' : 'warn') : 'bad'}"></span>
        {#if $conn.phase !== 'connected'}
          connecting
        {:else if !$conn.daemonOnline}
          offline{$conn.lastSeenMs ? ` · ${new Date($conn.lastSeenMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        {:else}
          {$conn.host?.hostname ?? 'connected'}
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d={tab.d} />
            </svg>
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
    --bg: #262624;
    --surface: #30302e;
    --surface-2: #3a3937;
    --border: #43423e;
    --text: #f0eee6;
    --muted: #a8a49c;
    --faint: #7d7a72;
    --accent: #d97757;
    --accent-soft: rgba(217, 119, 87, 0.14);
    --ok: #7fb47a;
    --ok-soft: rgba(127, 180, 122, 0.14);
    --warn: #d9a13f;
    --warn-soft: rgba(217, 161, 63, 0.13);
    --bad: #e0705f;
    --bad-soft: rgba(224, 112, 95, 0.13);
    --radius: 16px;
    --radius-sm: 11px;
    --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;
    --font-display: ui-serif, Georgia, 'Times New Roman', serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.55 var(--font-body);
    -webkit-font-smoothing: antialiased;
  }
  :global(button) {
    font: 600 14px/1.3 var(--font-body);
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    padding: 0.6rem 1.25rem;
    cursor: pointer;
    transition: transform 0.06s ease, opacity 0.15s ease;
  }
  :global(button:active) { transform: scale(0.97); }
  :global(button:disabled) { opacity: 0.45; }
  :global(input), :global(select) {
    font: 15px/1.4 var(--font-body);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.65rem 0.9rem;
    outline: none;
  }
  :global(input:focus), :global(select:focus) { border-color: var(--accent); }

  .app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    max-width: 860px;
    margin: 0 auto;
    padding-top: env(safe-area-inset-top);
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0.75rem 1.25rem 0.6rem;
  }
  .brand {
    font: 600 19px/1 var(--font-display);
    letter-spacing: -0.01em;
  }
  .conn {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; }
  .dot.ok { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .dot.warn { background: var(--warn); }
  .dot.bad { background: var(--bad); }

  main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }

  nav {
    display: flex;
    padding: 0.35rem 1.5rem calc(0.35rem + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--bg) 88%, black);
    border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    backdrop-filter: blur(14px);
  }
  nav a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 0.45rem 0 0.3rem;
    color: var(--faint);
    text-decoration: none;
    border-radius: var(--radius-sm);
    transition: color 0.15s ease;
  }
  nav a.active { color: var(--accent); }
  .icon-wrap { position: relative; width: 23px; height: 23px; }
  .icon-wrap svg { width: 100%; height: 100%; }
  .tab-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; }
  .badge {
    position: absolute;
    top: -5px;
    right: -10px;
    background: var(--bad);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    border-radius: 8px;
    padding: 0 4.5px;
    line-height: 15px;
  }
</style>
