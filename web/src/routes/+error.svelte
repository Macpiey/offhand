<script lang="ts">
  import { onMount } from 'svelte';

  // In-app boot/navigation failures are almost always a stale cached chunk
  // after a deploy (there is a ~2 min window where shell and chunks can be
  // mixed versions). Purge caches + SW and retry a few times with backoff
  // before ever showing an error to a human.
  let recovering = $state(true);

  const MAX_ATTEMPTS = 3;
  const RESET_AFTER_MS = 90_000;

  onMount(() => {
    void (async () => {
      try {
        let attempts = 0;
        let since = 0;
        try {
          const raw = sessionStorage.getItem('offhand-err-recovery');
          if (raw) ({ attempts, since } = JSON.parse(raw) as { attempts: number; since: number });
        } catch {
          /* corrupt state — treat as fresh */
        }
        if (Date.now() - since > RESET_AFTER_MS) {
          attempts = 0;
          since = Date.now();
        }
        if (attempts < MAX_ATTEMPTS) {
          sessionStorage.setItem('offhand-err-recovery', JSON.stringify({ attempts: attempts + 1, since }));
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          const regs = await navigator.serviceWorker?.getRegistrations?.();
          if (regs) await Promise.all(regs.map((r) => r.update()));
          // Backoff: give a mid-deploy CDN a moment to settle between tries.
          await new Promise((r) => setTimeout(r, 1200 * (attempts + 1)));
          location.replace('/?v=' + Date.now());
          return;
        }
        sessionStorage.removeItem('offhand-err-recovery');
      } catch {
        /* fall through to manual UI */
      }
      recovering = false;
    })();
  });
</script>

<div class="wrap">
  {#if recovering}
    <div class="spin"></div>
    <h1>Updating offhand…</h1>
    <p>Loading the latest version.</p>
  {:else}
    <h1>Something broke</h1>
    <p>Close the app fully and open it again.</p>
    <button onclick={() => location.replace('/?v=' + Date.now())}>Reload</button>
  {/if}
</div>

<style>
  .wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    text-align: center;
    padding: 2rem;
  }
  h1 { font: 700 20px/1.2 var(--serif); margin: 0; }
  p { color: var(--mute); margin: 0; font-size: 14px; }
  .spin {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2.5px solid var(--hairline-2);
    border-top-color: var(--brand);
    animation: r 0.9s linear infinite;
    margin-bottom: 0.5rem;
  }
  @keyframes r { to { transform: rotate(360deg); } }
  button { margin-top: 0.6rem; }
</style>
