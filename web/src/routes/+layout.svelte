<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { boot } from '$lib/client.js';
  import { conn, waiting, justPaired } from '$lib/stores.js';
  import PairScreen from '$lib/components/PairScreen.svelte';
  import Onboarding from '$lib/components/Onboarding.svelte';
  import VerifyPairing from '$lib/components/VerifyPairing.svelte';
  import SessionList from '$lib/components/SessionList.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let { children } = $props();
  let bootError = $state('');
  let onboarded = $state(true);

  onMount(() => {
    onboarded = localStorage.getItem('offhand.onboarded') === '1';
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    boot().catch((e) => (bootError = e instanceof Error ? e.message : String(e)));

    // Keyboard-aware composer: expose the keyboard overlap as a CSS var.
    const vv = window.visualViewport;
    if (vv) {
      const update = () => {
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        document.documentElement.style.setProperty('--kb', `${kb}px`);
      };
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      update();
    }
  });

  function finishOnboarding(): void {
    localStorage.setItem('offhand.onboarded', '1');
    onboarded = true;
  }

  const tabs = [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/session', label: 'Chat', icon: 'chat' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];
</script>

<svelte:head>
  <meta name="color-scheme" content="dark" />
</svelte:head>

<div class="app">
  {#if $justPaired}
    <VerifyPairing />
  {/if}
  {#if $conn.phase === 'unpaired' && !onboarded}
    <Onboarding onDone={finishOnboarding} />
  {:else if $conn.phase === 'unpaired'}
    <PairScreen error={bootError} />
  {:else}
    <aside class="rail">
      <div class="rail-head">
        <span class="brand">offhand</span>
        <span class="conn" class:off={$conn.phase !== 'connected' || !$conn.daemonOnline}>
          <span class="dot"></span>
          {$conn.phase !== 'connected' ? 'Connecting' : !$conn.daemonOnline ? 'Offline' : ($conn.host?.hostname ?? 'Connected')}
        </span>
      </div>
      <div class="rail-list"><SessionList /></div>
      <a class="rail-settings" href="/settings" class:active={$page.url.pathname === '/settings'}>
        <Icon name="settings" size={17} /> Settings
      </a>
    </aside>

    <div class="frame">
      {#if $page.url.pathname !== '/session'}
        <header>
          <span class="brand">offhand</span>
          <span class="conn" class:off={$conn.phase !== 'connected' || !$conn.daemonOnline}>
            <span class="dot"></span>
            {$conn.phase !== 'connected' ? 'Connecting' : !$conn.daemonOnline ? 'Offline' : ($conn.host?.hostname ?? 'Connected')}
          </span>
        </header>
      {/if}

      {#if $conn.phase === 'connected' && !$conn.daemonOnline}
        <div class="offline-note">
          <Icon name="alert" size={13} />
          Computer offline{$conn.lastSeenMs ? ` · last seen ${new Date($conn.lastSeenMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </div>
      {/if}

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
    </div>
  {/if}
</div>

<style>
  :global(:root) {
    --bg: #131210;
    --card: #1f1e1a;
    --raised: #2a2824;
    --hairline: rgba(240, 238, 230, 0.09);
    --hairline-2: rgba(240, 238, 230, 0.16);
    --ink: #edebe6;
    --mute: #a29e96;
    --ghost: #6e6b64;
    --brand: #d97757;
    --brand-down: #c4663f;
    --brand-soft: rgba(217, 119, 87, 0.14);
    --bubble: #ece7dd;
    --bubble-ink: #201f1b;
    --ok: #7fb47a;
    --ok-soft: rgba(127, 180, 122, 0.11);
    --warn: #d9a13f;
    --warn-soft: rgba(217, 161, 63, 0.11);
    --risk: #e0705f;
    --risk-soft: rgba(224, 112, 95, 0.12);
    --r-ctl: 10px;
    --r-card: 16px;
    --r-sheet: 24px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;
    --serif: ui-serif, Georgia, serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --inset-t: max(env(safe-area-inset-top), 12px);
    --inset-b: max(env(safe-area-inset-bottom), 10px);
    --inset-l: env(safe-area-inset-left);
    --inset-r: env(safe-area-inset-right);
  }
  :global(*) { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
  :global(html), :global(body) {
    margin: 0;
    background: var(--bg);
    overscroll-behavior: none;
    height: 100%;
  }
  :global(body) {
    color: var(--ink);
    font: 400 15px/1.5 var(--font);
    -webkit-font-smoothing: antialiased;
    position: fixed; /* the frame NEVER scrolls — only content panes do */
    inset: 0;
    overflow: hidden;
  }
  :global(::-webkit-scrollbar) { width: 0; height: 0; }
  :global(*) { scrollbar-width: none; }
  :global(button) {
    font: 600 14px/1 var(--font);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--brand);
    color: #fff;
    height: 42px;
    padding: 0 1.1rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    transition: background 0.15s ease, opacity 0.15s ease, transform 0.05s ease;
    user-select: none;
    -webkit-user-select: none;
  }
  :global(button:active) { transform: scale(0.98); background: var(--brand-down); }
  :global(button:disabled) { opacity: 0.4; pointer-events: none; }
  :global(input), :global(select), :global(textarea) {
    font: 400 15px/1.4 var(--font);
    background: var(--card);
    color: var(--ink);
    border: 1px solid var(--hairline-2);
    border-radius: var(--r-ctl);
    padding: 0.6rem 0.85rem;
    outline: none;
  }
  :global(input:focus), :global(select:focus), :global(textarea:focus) { border-color: var(--brand); }
  :global(input::placeholder), :global(textarea::placeholder) { color: var(--ghost); }

  .app {
    position: fixed;
    inset: 0;
    display: flex;
  }
  .rail { display: none; }
  .frame {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding-left: var(--inset-l);
    padding-right: var(--inset-r);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(var(--inset-t)) 1.25rem 0.5rem;
    flex-shrink: 0;
  }
  .brand { font: 700 17px/1 var(--serif); letter-spacing: -0.01em; }
  .conn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--mute);
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 0.28rem 0.75rem;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); }
  .conn.off .dot { background: var(--warn); }
  .offline-note {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0.25rem 1.25rem 0.25rem;
    padding: 0.5rem 0.85rem;
    background: var(--warn-soft);
    border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
    border-radius: var(--r-ctl);
    color: var(--warn);
    font-size: 12.5px;
    font-weight: 500;
    flex-shrink: 0;
  }
  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
  }
  nav {
    align-self: center;
    flex-shrink: 0;
    display: flex;
    gap: 2px;
    margin: 0.45rem auto calc(var(--inset-b) + 0.3rem);
    padding: 4px;
    background: var(--raised);
    border: 1px solid var(--hairline);
    border-radius: 999px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  }
  nav a {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0.5rem 0.95rem;
    border-radius: 999px;
    color: var(--ghost);
    text-decoration: none;
    transition: background 0.15s ease, color 0.15s ease;
  }
  nav a.active { background: var(--brand-soft); color: var(--brand); }
  .tab-label { display: none; font-size: 13px; font-weight: 600; }
  nav a.active .tab-label { display: inline; }
  .icon-wrap { position: relative; display: grid; place-items: center; height: 22px; }
  .badge {
    position: absolute;
    top: -4px;
    right: -11px;
    background: var(--brand);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    border-radius: 8px;
    padding: 0 4.5px;
    line-height: 15px;
  }

  /* ≥700px: two-pane — sessions rail left, content right, no bottom nav. */
  @media (min-width: 700px) {
    .rail {
      display: flex;
      flex-direction: column;
      width: 300px;
      flex-shrink: 0;
      border-right: 1px solid var(--hairline);
      padding: var(--inset-t) 0 var(--inset-b);
    }
    .rail-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.35rem 1.1rem 0.8rem;
    }
    .rail-list { flex: 1; overflow-y: auto; padding: 0 0.8rem; }
    .rail-settings {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0.6rem 0.8rem 0;
      padding: 0.6rem 0.9rem;
      border-radius: var(--r-ctl);
      color: var(--mute);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
    }
    .rail-settings:hover, .rail-settings.active { background: var(--card); color: var(--ink); }
    .frame header, .frame nav { display: none; }
    main { padding-top: var(--inset-t); }
  }
</style>
