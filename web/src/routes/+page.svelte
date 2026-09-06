<script lang="ts">
  import { sessions, waiting, workspaces, runners, newSessionOpen } from '$lib/stores.js';
  import { adoptConversation, listConversations, listFolders, send } from '$lib/client.js';
  import { portal } from '$lib/portal.js';
  import SessionList from '$lib/components/SessionList.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import type { ConversationSummary, FsDir } from '@offhand/shared';

  let newWorkspace = $state('');
  let newRunner = $state('');
  let newModel = $state('');
  let newLabel = $state('');
  let importOpen = $state(false);
  let importLoading = $state(false);
  let importError = $state('');
  let conversations = $state<ConversationSummary[]>([]);
  let browserOpen = $state(false);
  let folderPath = $state('');
  let folderParent = $state<string | null>(null);
  let folderDirs = $state<FsDir[]>([]);
  let folderLoading = $state(false);
  let folderError = $state('');
  const showNew = $derived($newSessionOpen);

  const live = $derived($sessions.filter((s) => !s.archived));
  const working = $derived(live.filter((s) => s.busy).length);

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    return h < 5 ? 'Up late.' : h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.';
  });
  const statusLine = $derived.by(() => {
    if ($waiting.size > 0) return `${$waiting.size} thing${$waiting.size > 1 ? 's' : ''} need${$waiting.size > 1 ? '' : 's'} you.`;
    if (working > 0) return `${working} agent${working > 1 ? 's' : ''} working.`;
    return 'All quiet.';
  });

  const selectedRunner = $derived($runners.find((r) => r.id === newRunner));

  function closeNewSession(): void {
    newSessionOpen.set(false);
    importOpen = false;
    browserOpen = false;
  }

  function selectWorkspace(path: string): void {
    newWorkspace = path;
    importOpen = false;
    importError = '';
    conversations = [];
  }

  function createSession(): void {
    if (!newWorkspace || !newRunner) return;
    send({
      type: 'session-create',
      workspace: newWorkspace,
      runnerId: newRunner,
      ...(newModel ? { model: newModel } : {}),
      ...(newLabel.trim() ? { label: newLabel.trim() } : {}),
    });
    closeNewSession();
    newLabel = '';
    newModel = '';
  }

  async function showImport(): Promise<void> {
    if (!newWorkspace) return;
    importOpen = true;
    importLoading = true;
    importError = '';
    try {
      conversations = await listConversations(newWorkspace);
    } catch (e) {
      importError = e instanceof Error ? e.message : String(e);
      conversations = [];
    } finally {
      importLoading = false;
    }
  }

  function importConversation(conversation: ConversationSummary): void {
    adoptConversation(conversation.workspace, conversation.conversationId);
    closeNewSession();
  }

  async function openBrowser(): Promise<void> {
    browserOpen = true;
    await loadFolder(newWorkspace || undefined);
  }

  async function loadFolder(path?: string): Promise<void> {
    folderLoading = true;
    folderError = '';
    try {
      const res = await listFolders(path);
      folderPath = res.path;
      folderParent = res.parent;
      folderDirs = res.dirs;
    } catch (e) {
      folderError = e instanceof Error ? e.message : String(e);
      folderDirs = [];
    } finally {
      folderLoading = false;
    }
  }

  function useFolder(): void {
    if (!folderPath) return;
    selectWorkspace(folderPath);
    browserOpen = false;
  }

  function relativeTime(ms: number): string {
    const seconds = Math.max(1, Math.floor((Date.now() - ms) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86_400)}d ago`;
  }
</script>

<div class="page">
  <div class="hero">
    <h1>{greeting}</h1>
    <p class="status" class:hot={$waiting.size > 0}>{statusLine}</p>
  </div>

  <div class="strip">
    <div class="stat">
      <span class="n">{live.length}</span>
      <span class="l">Sessions</span>
    </div>
    <div class="stat" class:on={working > 0}>
      <span class="n">{working}</span>
      <span class="l">Working</span>
    </div>
    <div class="stat" class:hot={$waiting.size > 0}>
      <span class="n">{$waiting.size}</span>
      <span class="l">Need you</span>
    </div>
  </div>

  <SessionList />

  <button class="new" onclick={() => newSessionOpen.set(true)}><Icon name="plus" size={16} />New session</button>
</div>

{#if showNew}
  <div class="overlay" use:portal onclick={closeNewSession} onkeydown={(e) => e.key === 'Escape' && closeNewSession()} role="presentation">
    <div class="sheet" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="New session" tabindex="-1" onkeydown={() => {}}>
      <div class="handle"></div>
      <h2>New session</h2>

      {#if browserOpen}
        <div class="browser-head">
          <button class="up" disabled={!folderParent} onclick={() => folderParent && void loadFolder(folderParent)}>↑</button>
          <div>
            <span class="group">Folder</span>
            <p class="path">{folderPath || 'This computer'}</p>
          </div>
        </div>

        <div class="opts folder-list">
          {#if folderLoading}
            <p class="empty">Loading folders…</p>
          {:else if folderError}
            <p class="empty warn">{folderError}</p>
          {:else if folderDirs.length === 0}
            <p class="empty">No folders here.</p>
          {:else}
            {#each folderDirs as dir (dir.path)}
              <button class="opt folder-row" onclick={() => void loadFolder(dir.path)}>
                <span class="opt-label">{dir.name}</span>
                {#if dir.isGit}<span class="git-tag">git</span>{/if}
              </button>
            {/each}
          {/if}
        </div>

        <button class="create" onclick={useFolder} disabled={!folderPath}>Use this folder</button>
        <button class="minor" onclick={() => (browserOpen = false)}>Back</button>
      {:else}
        <div class="group-row">
          <span class="group">Workspace</span>
          <button class="minor inline" onclick={() => void openBrowser()}>Browse this computer…</button>
        </div>
        <div class="opts">
          {#if newWorkspace && !$workspaces.some((w) => w.path === newWorkspace)}
            <button class="opt sel" onclick={() => selectWorkspace(newWorkspace)}>
              <span class="radio on"></span>
              <span class="opt-label">{newWorkspace}</span>
            </button>
          {/if}
          {#each $workspaces as w (w.path)}
            <button class="opt" class:sel={newWorkspace === w.path} onclick={() => selectWorkspace(w.path)}>
              <span class="radio" class:on={newWorkspace === w.path}></span>
              <span class="opt-label">{w.label}</span>
              {#if w.gitBranch}<span class="opt-meta">{w.gitBranch}</span>{/if}
            </button>
          {/each}
        </div>

        {#if newWorkspace}
          <button class="minor" onclick={() => void showImport()}>Import from this computer…</button>
          {#if importOpen}
            <div class="opts import-list">
              {#if importLoading}
                <p class="empty">Looking for Claude Code conversations…</p>
              {:else if importError}
                <p class="empty warn">{importError}</p>
              {:else if conversations.length === 0}
                <p class="empty">No Claude Code conversations found for this workspace.</p>
              {:else}
                {#each conversations as c (c.conversationId)}
                  <button class="opt import-row" onclick={() => importConversation(c)}>
                    <span class="prompt">{c.firstPrompt}</span>
                    <span class="details">{relativeTime(c.lastActiveMs)} · {c.messageCount} message{c.messageCount === 1 ? '' : 's'}</span>
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        {/if}

        <span class="group">Agent</span>
        <div class="opts">
          {#each $runners.filter((r) => r.available) as r (r.id)}
            <button class="opt" class:sel={newRunner === r.id} onclick={() => { newRunner = r.id; newModel = ''; }}>
              <span class="radio" class:on={newRunner === r.id}></span>
              <span class="opt-label">{r.name}</span>
              {#if !r.supportsApprovals}<span class="opt-meta warn">unguarded</span>
              {:else}<span class="opt-meta ok">ready</span>{/if}
            </button>
          {/each}
        </div>

        {#if selectedRunner && selectedRunner.models.length > 0}
          <span class="group">Model</span>
          <select bind:value={newModel}>
            <option value="">Default</option>
            {#each selectedRunner.models as m (m)}<option value={m}>{m}</option>{/each}
          </select>
        {/if}

        <input placeholder="Name · optional" bind:value={newLabel} />

        <button class="create" onclick={createSession} disabled={!newWorkspace || !newRunner}>Start session</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page { flex: 1; padding: 0.4rem 1.25rem 1rem; display: flex; flex-direction: column; gap: 1rem; }
  .hero { margin-top: 0.3rem; }
  h1 { font: 700 26px/1.2 var(--serif); letter-spacing: -0.02em; margin: 0; }
  .status { color: var(--mute); margin: 0.2rem 0 0; font-size: 15px; }
  .status.hot { color: var(--warn); font-weight: 600; }
  .strip { display: flex; gap: 0.55rem; }
  .stat {
    flex: 1;
    background: var(--card);
    border: 1px solid var(--hairline);
    border-radius: var(--r-card);
    padding: 0.7rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat .n { font: 700 20px/1 var(--serif); }
  .stat .l { font-size: 11px; font-weight: 600; color: var(--ghost); text-transform: uppercase; letter-spacing: 0.06em; }
  .stat.on .n { color: var(--brand); }
  .stat.hot .n { color: var(--warn); }
  .stat.hot { border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
  .new { margin-top: auto; align-self: stretch; height: 50px; font-size: 15px; border-radius: 14px; }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    /* Keep the sheet above the iOS keyboard when an input inside has focus. */
    padding-bottom: calc(100dvh - var(--vvh, 100dvh) - var(--vvo, 0px));
  }
  .sheet {
    width: 100%;
    max-width: 560px;
    max-height: 86dvh;
    overflow-y: auto;
    background: var(--card);
    border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    padding: 0.55rem 1.4rem calc(var(--inset-b) + 1rem);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    animation: rise 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @keyframes rise { from { transform: translateY(48px); opacity: 0.4; } }
  .handle { width: 36px; height: 4px; border-radius: 2px; background: var(--hairline-2); align-self: center; }
  h2 { font: 600 17px/1.2 var(--font); margin: 0.3rem 0 0.2rem; }
  .group {
    font-size: 11px;
    font-weight: 700;
    color: var(--ghost);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-top: 0.3rem;
  }
  .group-row { display: flex; align-items: center; justify-content: space-between; margin-top: 0.3rem; gap: 0.7rem; }
  .group-row .group, .browser-head .group { margin: 0; }
  .opts { display: flex; flex-direction: column; gap: 0.4rem; }
  .opt {
    justify-content: flex-start;
    height: 46px;
    background: var(--bg);
    border: 1px solid var(--hairline);
    color: var(--ink);
    font-weight: 500;
    gap: 0.7rem;
    padding: 0 0.9rem;
  }
  .opt:active { background: var(--bg); }
  .opt.sel { border-color: var(--brand); }
  .radio {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid var(--ghost);
    flex-shrink: 0;
  }
  .radio.on { border-color: var(--brand); background: radial-gradient(circle, var(--brand) 45%, transparent 50%); }
  .opt-label { flex: 1; text-align: left; }
  .opt-meta { font-size: 11px; color: var(--ghost); font-family: var(--mono); }
  .opt-meta.ok { color: var(--ok); font-family: var(--font); font-weight: 600; }
  .opt-meta.warn { color: var(--warn); font-family: var(--font); font-weight: 600; }
  .minor {
    min-height: 38px;
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: 12px;
    color: var(--mute);
    font-size: 13px;
    font-weight: 600;
  }
  .minor.inline { min-height: 32px; padding: 0 0.75rem; white-space: nowrap; }
  .import-list, .folder-list { max-height: 260px; overflow-y: auto; }
  .import-row {
    height: auto;
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 0.9rem;
  }
  .prompt { color: var(--ink); text-align: left; line-height: 1.25; }
  .details { color: var(--ghost); font-size: 11px; font-family: var(--mono); }
  .empty { margin: 0; padding: 0.8rem; color: var(--ghost); font-size: 13px; text-align: center; }
  .empty.warn { color: var(--warn); }
  .browser-head { display: flex; align-items: center; gap: 0.75rem; }
  .up {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: var(--bg);
    color: var(--ink);
  }
  .path { margin: 0.2rem 0 0; color: var(--mute); font-family: var(--mono); font-size: 12px; word-break: break-all; }
  .folder-row { height: 42px; }
  .git-tag {
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand) 18%, transparent);
    color: var(--brand);
    font-size: 10px;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .create { margin-top: 0.4rem; height: 48px; font-size: 15px; }
</style>
