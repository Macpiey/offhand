<script lang="ts">
  import Icon from './Icon.svelte';

  let { onDone }: { onDone: () => void } = $props();
  let step = $state(0);

  const slides = [
    {
      icon: 'chat',
      title: "Your agent works.\nYou're at dinner.",
      body: 'Drive Claude Code, Copilot and more from your phone — while they run on your machine, with your keys, on your repos.',
    },
    {
      icon: 'lock',
      title: 'Approve the scary command\nfrom your lock screen.',
      body: 'Your agent pauses on risky actions until you decide. One tap unblocks it — from anywhere.',
    },
    {
      icon: 'shield',
      title: "We can't read your code.",
      body: 'End-to-end encrypted. Keys never leave your devices. Enforced by cryptography, not by promises.',
    },
  ];
</script>

<div class="onboarding">
  <div class="slide">
    <div class="art"><Icon name={slides[step]!.icon} size={30} stroke={1.5} /></div>
    <h1>{slides[step]!.title}</h1>
    <p>{slides[step]!.body}</p>
  </div>

  <div class="foot">
    <div class="dots">
      {#each slides as _, i (i)}<span class="d" class:on={i === step}></span>{/each}
    </div>
    {#if step < slides.length - 1}
      <button onclick={() => step++}>Continue <Icon name="arrow-right" size={16} /></button>
      <button class="skip" onclick={onDone}>Skip</button>
    {:else}
      <button onclick={onDone}>Get started</button>
      <div class="skip-space"></div>
    {/if}
  </div>
</div>

<style>
  .onboarding {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: calc(var(--inset-t) + 1rem) 2rem var(--inset-b);
  }
  .slide {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 1.1rem;
  }
  .art {
    width: 72px;
    height: 72px;
    border-radius: 22px;
    background: var(--card);
    border: 1px solid var(--hairline);
    color: var(--brand);
    display: grid;
    place-items: center;
    margin-bottom: 0.6rem;
  }
  h1 {
    font: 700 26px/1.25 var(--serif);
    letter-spacing: -0.02em;
    margin: 0;
    white-space: pre-line;
  }
  p { color: var(--mute); margin: 0; max-width: 300px; font-size: 15px; line-height: 1.6; }
  .foot { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; padding-top: 1.5rem; }
  .dots { display: flex; gap: 7px; margin-bottom: 0.3rem; }
  .d { width: 7px; height: 7px; border-radius: 50%; background: var(--hairline-2); transition: background 0.2s; }
  .d.on { background: var(--brand); }
  .foot > button:not(.skip) { width: 100%; max-width: 340px; height: 48px; font-size: 15px; }
  .skip { background: none; color: var(--ghost); height: 38px; }
  .skip:active { background: none; }
  .skip-space { height: 38px; }
</style>
