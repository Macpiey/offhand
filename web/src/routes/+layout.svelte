<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { boot } from '$lib/client.js';
  import { conn, justPaired } from '$lib/stores.js';
  import PairScreen from '$lib/components/PairScreen.svelte';
  import Onboarding from '$lib/components/Onboarding.svelte';
  import VerifyPairing from '$lib/components/VerifyPairing.svelte';
  import SessionList from '$lib/components/SessionList.svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import MenuButton from '$lib/components/MenuButton.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let { children } = $props();
  let bootError = $state('');
  let onboarded = $state(true);

  onMount(() => {
    onboarded = localStorage.getItem('offhand.onboarded') === '1';
    // SvelteKit auto-registers src/service-worker.ts; clean up the legacy
    // hand-registered /sw.js worker if one is still installed.
    void navigator.serviceWorker?.getRegistrations?.().then((regs) => {
      for (const r of regs) {
        if (r.active?.scriptURL.endsWith('/sw.js')) void r.unregister();
      }
    });
    boot().catch((e) => (bootError = e instanceof Error ? e.message : String(e)));

    // Keyboard handling for iOS: GLUE the app frame to the visual viewport.
    // iOS scrolls the layout viewport when the keyboard opens and always wins
    // that fight — so instead of resisting, the frame translates along with
    // the visual viewport (offsetTop) and shrinks to its height. The composer
    // ends up sitting exactly on the keyboard, nothing floats, ever.
    const vv = window.visualViewport;
    if (vv) {
      const update = () => {
        const kb = Math.max(0, window.innerHeight - vv.height);
        document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
        document.documentElement.style.setProperty('--vvo', `${vv.offsetTop}px`);
        document.documentElement.classList.toggle('kb-open', kb > 40);
        // Only snap the layout viewport back once the keyboard is gone.
        if (kb <= 40 && (window.scrollY !== 0 || document.documentElement.scrollTop !== 0)) {
          window.scrollTo(0, 0);
        }
      };
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      window.addEventListener('resize', update);
      window.addEventListener('pageshow', update);
      update();
      // iOS reports transitional viewport sizes during PWA launch — re-measure.
      setTimeout(update, 300);
      setTimeout(update, 1200);

      // Belt and braces: keyboard dismissal via blur + app foregrounding, plus
      // a slow heartbeat — iOS occasionally skips the resize event entirely
      // (snapshot restores), which used to leave a permanent phantom gap.
      window.addEventListener('focusout', () => setTimeout(update, 80));
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) setTimeout(update, 80);
      });
      setInterval(update, 2000);
    }
  });

  function finishOnboarding(): void {
    localStorage.setItem('offhand.onboarded', '1');
    onboarded = true;
  }
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
      <div class="rail-links">
        <a class="rail-link" href="/drops" class:active={$page.url.pathname === '/drops'}>
          <Icon name="inbox" size={17} /> Drops
        </a>
        <a class="rail-link" href="/settings" class:active={$page.url.pathname === '/settings'}>
          <Icon name="settings" size={17} /> Settings
        </a>
      </div>
    </aside>

    <div class="frame">
      {#if $page.url.pathname !== '/session'}
        <header>
          <MenuButton />
          <span class="brand">{$page.url.pathname === '/settings' ? 'Settings' : $page.url.pathname === '/drops' ? 'Drops' : 'offhand'}</span>
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
    </div>

    <Drawer />
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
    top: 0;
    left: 0;
    right: 0;
    height: var(--vvh, 100%);
    transform: translateY(var(--vvo, 0px));
    display: flex;
  }
  /* Keyboard open: home-indicator inset is irrelevant (keyboard covers it). */
  :global(html.kb-open) { --inset-b: 6px; }
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
    gap: 0.6rem;
    padding: calc(var(--inset-t)) 0.9rem 0.5rem 0.75rem;
    flex-shrink: 0;
  }
  .brand { flex: 1; font: 700 18px/1 var(--serif); letter-spacing: -0.01em; }
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

  /* ≥700px: two-pane — sessions rail left, content right. */
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
    .rail-links { display: flex; flex-direction: column; gap: 0.15rem; margin: 0.6rem 0.8rem 0; }
    .rail-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.9rem;
      border-radius: var(--r-ctl);
      color: var(--mute);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
    }
    .rail-link:hover, .rail-link.active { background: var(--card); color: var(--ink); }
    .frame header { display: none; }
    main { padding-top: var(--inset-t); }
  }
</style>
