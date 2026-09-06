<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import gsap from 'gsap';
  import { conn, drawerOpen, newSessionOpen } from '$lib/stores.js';
  import SessionList from './SessionList.svelte';
  import Icon from './Icon.svelte';

  // Stays mounted through the close animation.
  let visible = $state(false);
  let panel = $state<HTMLElement | null>(null);
  let scrim = $state<HTMLElement | null>(null);

  $effect(() => {
    if ($drawerOpen) {
      visible = true;
      requestAnimationFrame(() => {
        if (!panel || !scrim) return;
        gsap.fromTo(panel, { x: '-104%' }, { x: '0%', duration: 0.42, ease: 'power4.out' });
        gsap.fromTo(scrim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.28, ease: 'power2.out' });
      });
    } else if (visible && panel && scrim) {
      gsap.to(panel, { x: '-104%', duration: 0.3, ease: 'power3.in' });
      gsap.to(scrim, {
        autoAlpha: 0,
        duration: 0.26,
        ease: 'power2.in',
        onComplete: () => (visible = false),
      });
    }
  });

  function nav(path: string): void {
    drawerOpen.set(false);
    void goto(path);
  }
  function newSession(): void {
    drawerOpen.set(false);
    newSessionOpen.set(true);
    if ($page.url.pathname !== '/') void goto('/');
  }

  const online = $derived($conn.phase === 'connected' && $conn.daemonOnline);
</script>

{#if visible}
  <div
    class="scrim"
    bind:this={scrim}
    onclick={() => drawerOpen.set(false)}
    onkeydown={(e) => e.key === 'Escape' && drawerOpen.set(false)}
    role="presentation"
  ></div>
  <aside class="drawer" bind:this={panel} aria-label="Navigation">
    <div class="head">
      <span class="brand">offhand</span>
      <span class="conn" class:off={!online}>
        <span class="dot"></span>
        {$conn.phase !== 'connected' ? 'Connecting' : !$conn.daemonOnline ? 'Offline' : ($conn.host?.hostname ?? 'Connected')}
      </span>
    </div>

    <button class="new" onclick={newSession}><Icon name="plus" size={15} />New session</button>

    <div class="list"><SessionList onNavigate={() => drawerOpen.set(false)} /></div>

    <div class="links">
      <button class="link" class:active={$page.url.pathname === '/'} onclick={() => nav('/')}>
        <Icon name="home" size={17} /> Overview
      </button>
      <button class="link" class:active={$page.url.pathname === '/drops'} onclick={() => nav('/drops')}>
        <Icon name="inbox" size={17} /> Drops
      </button>
      <button class="link" class:active={$page.url.pathname === '/settings'} onclick={() => nav('/settings')}>
        <Icon name="settings" size={17} /> Settings
      </button>
    </div>
  </aside>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
    background: rgba(0, 0, 0, 0.55);
  }
  .drawer {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 45;
    width: min(80vw, 320px);
    background: var(--card);
    border-right: 1px solid var(--hairline);
    border-radius: 0 24px 24px 0;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: calc(var(--inset-t) + 0.5rem) 1rem calc(var(--inset-b) + 0.5rem);
    transform: translateX(-104%);
    box-shadow: 24px 0 60px rgba(0, 0, 0, 0.45);
  }
  .head { display: flex; align-items: center; justify-content: space-between; padding: 0 0.25rem; }
  .brand { font: 700 19px/1 var(--serif); letter-spacing: -0.01em; }
  .conn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--mute);
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 0.26rem 0.7rem;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); }
  .conn.off .dot { background: var(--warn); }
  .new { height: 44px; border-radius: 12px; font-size: 14px; }
  .list { flex: 1; min-height: 0; overflow-y: auto; }
  .links { display: flex; flex-direction: column; gap: 0.15rem; border-top: 1px solid var(--hairline); padding-top: 0.6rem; }
  .link {
    justify-content: flex-start;
    gap: 0.7rem;
    height: 44px;
    background: transparent;
    color: var(--mute);
    font-weight: 600;
    font-size: 14px;
    border-radius: 10px;
    padding: 0 0.7rem;
  }
  .link:active { background: var(--bg); }
  .link.active { color: var(--ink); background: var(--bg); }

  @media (min-width: 700px) {
    .scrim, .drawer { display: none; }
  }
</style>
