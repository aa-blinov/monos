<script>
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { themes } from '../lib/themes.js';
  import { activeTheme } from '../stores.js';

  let settings = {
    auto_sync_interval: 0,
    auto_format_on_save: false,
    git_commit_message: 'Sync from Monos WebUI',
    git_token: '',
    git_owner: '',
    git_repo: '',
    git_branch: 'main',
    device_name: '',
  };

  let gitStatus = null;
  let gitRepos = [];
  let gitBranches = [];
  let gitConflicts = [];
  let isLoadingRepos = false;
  let isLoadingBranches = false;
  let isConnecting = false;
  let isAuthenticated = false;
  let isSyncing = false;
  let isCheckingStatus = false;
  let gitError = '';

  async function loadSettings() {
    try {
      const r = await fetch('/api/settings');
      if (!r.ok) return;
    settings = await r.json();
    if (settings.theme && themes[settings.theme]) {
      $activeTheme = settings.theme;
    }
      if (settings.git_token) {
        isAuthenticated = true;
        await fetchRepos();
        if (settings.git_repo) {
          await loadBranches();
          await setupGitRepo();
        }
      }
    } catch (e) { console.error(e); }
  }

  async function saveSettings() {
    try {
      const payload = { ...settings, theme: $activeTheme };
      await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) { console.error(e); }
  }

  async function fetchRepos() {
    if (!settings.git_token) return;
    isLoadingRepos = true;
    try {
      const r = await fetch(`/api/git/repos?token=${encodeURIComponent(settings.git_token)}`);
      if (r.ok) gitRepos = await r.json();
    } catch (e) { console.error(e); }
    finally { isLoadingRepos = false; }
  }

  async function authenticate() {
    if (!settings.git_token.trim()) return;
    isConnecting = true; gitError = '';
    try {
      const userR = await fetch(`/api/git/user?token=${encodeURIComponent(settings.git_token)}`);
      if (!userR.ok) { gitError = 'Invalid token'; return; }
      settings.git_owner = (await userR.json()).login;
      const reposR = await fetch(`/api/git/repos?token=${encodeURIComponent(settings.git_token)}`);
      if (!reposR.ok) { gitError = 'Failed to fetch repos'; return; }
      gitRepos = await reposR.json();
      isAuthenticated = true;
      if (gitRepos.length === 1) settings.git_repo = gitRepos[0].name;
      await saveSettings();
      if (settings.git_repo) { await loadBranches(); await setupGitRepo(); }
    } catch (e) { gitError = e.message; }
    finally { isConnecting = false; }
  }

  async function onRepoChange() {
    if (settings.git_repo) { await loadBranches(); await setupGitRepo(); }
  }

  async function loadBranches() {
    if (!settings.git_token || !settings.git_owner || !settings.git_repo) return;
    isLoadingBranches = true;
    try {
      const r = await fetch(`/api/git/branches?token=${encodeURIComponent(settings.git_token)}&owner=${encodeURIComponent(settings.git_owner)}&repo=${encodeURIComponent(settings.git_repo)}`);
      if (r.ok) {
        gitBranches = (await r.json()).branches || [];
        if (gitBranches.length && !gitBranches.includes(settings.git_branch))
          settings.git_branch = gitBranches[0];
      }
    } catch (e) { console.error(e); }
    finally { isLoadingBranches = false; }
  }

  async function setupGitRepo() {
    if (!settings.git_token || !settings.git_owner || !settings.git_repo) return;
    try {
      const r = await fetch('/api/git/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: settings.git_token, owner: settings.git_owner, repo: settings.git_repo, branch: settings.git_branch, device_name: settings.device_name })
      });
      if (r.ok) await checkGitStatus();
      else gitError = (await r.json()).detail;
    } catch (e) { console.error(e); }
  }

  async function handleSync() {
    isSyncing = true;
    try {
      const r = await fetch('/api/git/sync', { method: 'POST' });
      const data = await r.json();
      if (data.success) await checkGitStatus();
      if (data.conflicts?.length) await loadConflicts();
    } catch (e) { console.error(e); }
    finally { isSyncing = false; }
  }

  async function checkGitStatus() {
    isCheckingStatus = true;
    try {
      const r = await fetch('/api/git/status');
      if (r.ok) gitStatus = await r.json();
    } catch (e) { console.error(e); }
    finally { isCheckingStatus = false; }
  }

  async function loadConflicts() {
    try {
      const r = await fetch('/api/git/conflicts');
      if (r.ok) gitConflicts = (await r.json()).conflicts || [];
    } catch (e) { console.error(e); }
  }

  async function resolveConflicts() {
    try { await fetch('/api/git/conflicts/resolve', { method: 'POST' }); gitConflicts = []; await checkGitStatus(); }
    catch (e) { console.error(e); }
  }

  onMount(() => { loadSettings(); checkGitStatus(); });
</script>

<div class="h-full overflow-y-auto">
  <div class="max-w-2xl mx-auto px-6 lg:px-12 py-10 lg:py-16 space-y-10">

    <!-- Header -->
    <div class="flex items-center gap-4">
      <button on:click={() => navigate('/')} class="p-1 hover:opacity-60 transition-opacity" title="Back">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <h1 class="text-3xl lg:text-4xl font-serif tracking-tight">Settings</h1>
    </div>

    <!-- Theme -->
    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">Theme</h2>
      <div class="grid grid-cols-3 gap-3">
        {#each Object.entries(themes) as [key, t]}
          <button
            on:click={() => { $activeTheme = key; saveSettings(); }}
            class="p-4 border text-left transition-all text-sm {$activeTheme === key ? 'border-[var(--text-primary)] bg-[var(--bg-secondary)]' : 'border-[var(--border-subtle)] hover:border-[var(--text-primary)]'}"
          >
            <div class="flex gap-1.5 mb-2">
              <span class="w-4 h-4 rounded-full border border-[var(--border-subtle)]" style="background: {t.light['--bg-primary']}"></span>
              <span class="w-4 h-4 rounded-full border border-[var(--border-subtle)]" style="background: {t.dark['--bg-primary']}"></span>
            </div>
            <span class="text-xs">{$activeTheme === key ? '● ' : ''}{t.name}</span>
          </button>
        {/each}
      </div>
    </section>

    <!-- GitHub Connection -->
    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">GitHub Connection</h2>

      <!-- Help -->
      <details class="text-xs text-[var(--text-secondary)] group">
        <summary class="cursor-pointer hover:text-[var(--text-primary)] transition-colors">How to get a token?</summary>
        <div class="mt-3 space-y-2 p-3 border border-[var(--border-subtle)] rounded leading-relaxed">
          <p>1. Go to <a href="https://github.com/settings/tokens" target="_blank" class="underline hover:opacity-60">github.com/settings/tokens</a></p>
          <p>2. Click <strong>Generate new token</strong> → <strong>Fine-grained token</strong></p>
          <p>3. Set <strong>Repository access</strong> → <strong>Only select repositories</strong> → choose your notes repo</p>
          <p>4. Under <strong>Permissions</strong> → <strong>Contents</strong> → set <strong>Read and write</strong></p>
          <p>5. Click <strong>Generate token</strong> and copy it</p>
          <p class="pt-1 text-[var(--text-muted)]">The token needs <strong>Contents: Read and write</strong> permission to sync notes via the GitHub API.</p>
        </div>
      </details>

      <form on:submit|preventDefault={authenticate} class="contents">
        <label for="git-token" class="block text-xs text-[var(--text-secondary)] mb-1.5">Personal Access Token</label>
        <div class="flex gap-3">
          <input type="text" name="username" autocomplete="username" value="token" class="hidden" aria-hidden="true" tabindex="-1" />
          <input type="password" name="token" id="git-token" autocomplete="new-password" bind:value={settings.git_token} placeholder="ghp_..." class="flex-1 bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)] text-sm" disabled={isAuthenticated} />
          {#if isAuthenticated}
            <button type="button" on:click={() => { isAuthenticated = false; settings.git_token = ''; settings.git_owner = ''; settings.git_repo = ''; gitRepos = []; }} class="text-xs uppercase tracking-widest font-bold shrink-0 text-[var(--red)]">Reset</button>
          {:else}
            <button type="submit" disabled={isConnecting || !settings.git_token} class="text-xs uppercase tracking-widest font-bold hover:opacity-60 disabled:opacity-30 shrink-0">
              {isConnecting ? 'Connecting...' : 'Authenticate'}
            </button>
          {/if}
        </div>
      </form>

      {#if gitError}
        <div class="text-xs text-[var(--red)] bg-[var(--bg-secondary)] px-3 py-2 rounded">{gitError}</div>
      {/if}

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="git-owner" class="block text-xs text-[var(--text-secondary)] mb-1.5">Owner</label>
          <input type="text" id="git-owner" bind:value={settings.git_owner} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm {isAuthenticated ? 'opacity-50' : ''}" disabled={isAuthenticated} />
        </div>
        <div>
          <label class="block text-xs text-[var(--text-secondary)] mb-1.5">Repository</label>
          <select bind:value={settings.git_repo} on:change={onRepoChange} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm appearance-none cursor-pointer" disabled={!gitRepos.length}>
            <option value="">Select...</option>
            {#each gitRepos as r}
              <option value={r.name}>{r.full_name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label class="block text-xs text-[var(--text-secondary)] mb-1.5">Branch</label>
          <select bind:value={settings.git_branch} on:change={setupGitRepo} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm appearance-none cursor-pointer">
            {#if isLoadingBranches}
              <option>Loading...</option>
            {:else if gitBranches.length}
              {#each gitBranches as b}
                <option value={b}>{b}</option>
              {/each}
            {:else}
              <option value="main">main</option>
            {/if}
          </select>
        </div>
        <div>
          <label class="block text-xs text-[var(--text-secondary)] mb-1.5">Device Name</label>
          <input type="text" bind:value={settings.device_name} on:change={saveSettings} placeholder="My Laptop" class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)] text-sm" />
        </div>
      </div>
    </section>

    <!-- Sync Settings -->
    <section class="space-y-5 pt-2">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">Sync Settings</h2>

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label class="block text-xs text-[var(--text-secondary)] mb-1.5">Auto-Sync Interval (min)</label>
          <input type="number" bind:value={settings.auto_sync_interval} on:change={saveSettings} min="0" class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)] text-sm" />
          <p class="text-[10px] text-[var(--text-secondary)] mt-1">0 = disabled</p>
        </div>
        <div>
          <label class="block text-xs text-[var(--text-secondary)] mb-1.5">Commit Message</label>
          <input type="text" bind:value={settings.git_commit_message} on:change={saveSettings} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)] text-sm" />
        </div>
      </div>

      <div class="flex items-center gap-3">
        <input type="checkbox" id="auto-format" bind:checked={settings.auto_format_on_save} on:change={saveSettings} class="accent-[var(--text-primary)]" />
        <label for="auto-format" class="text-xs text-[var(--text-secondary)]">Auto-format on save</label>
      </div>
    </section>

    <!-- Status & Sync -->
    <section class="space-y-4 pt-2">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">Status & Sync</h2>

      <div class="border border-[var(--border-subtle)] rounded p-5">
        {#if isCheckingStatus}
          <div class="text-xs animate-pulse text-[var(--text-secondary)]">Checking...</div>
        {:else if gitStatus?.initialized}
          <div class="flex items-center justify-between">
            <div class="space-y-1.5 text-sm">
              <div class="flex items-center gap-2.5">
                <span class="w-2 h-2 rounded-full" class:bg-[var(--green)]={gitStatus.status === 'clean'} class:bg-[var(--yellow)]={gitStatus.status === 'dirty' || gitStatus.ahead > 0} class:bg-[var(--red)]={gitStatus.status === 'conflict' || gitStatus.behind > 0}></span>
                <span class="font-medium">{gitStatus.current_branch}</span>
                <span class="text-[var(--text-secondary)]">({gitStatus.status})</span>
              </div>
              {#if gitStatus.ahead > 0}<div class="text-xs text-[var(--text-secondary)]">↑ {gitStatus.ahead} ahead of remote</div>{/if}
              {#if gitStatus.behind > 0}<div class="text-xs text-[var(--text-secondary)]">↓ {gitStatus.behind} behind remote — pull recommended</div>{/if}
              {#if gitStatus.last_sync}<div class="text-[10px] text-[var(--text-muted)]">Last sync: {gitStatus.last_sync}</div>{/if}
            </div>
            <button on:click={handleSync} disabled={isSyncing} class="text-xs uppercase tracking-widest font-bold px-5 py-2.5 border border-[var(--border-subtle)] hover:border-[var(--text-primary)] transition disabled:opacity-30">
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        {:else if gitStatus && !gitStatus.initialized}
          <div class="text-sm text-[var(--text-secondary)]">Not initialized. Authenticate and select a repository above.</div>
        {:else}
          <div class="text-sm text-[var(--text-secondary)]">Loading status...</div>
        {/if}
      </div>

      <div class="flex gap-4 text-xs">
        <button on:click={checkGitStatus} class="uppercase tracking-widest hover:opacity-60 transition">Refresh Status</button>
        <button on:click={loadConflicts} class="uppercase tracking-widest hover:opacity-60 transition">View Conflicts</button>
      </div>
    </section>

    <!-- Conflicts -->
    {#if gitConflicts.length > 0}
      <section class="space-y-4 pt-2">
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">Conflicts ({gitConflicts.length})</h2>
        <div class="border border-[var(--border-subtle)] rounded p-4 space-y-2 max-h-48 overflow-y-auto">
          {#each gitConflicts as conflict}
            <div class="flex items-center justify-between py-1 text-sm border-b border-[var(--border-subtle)] last:border-0">
              <span class="truncate font-mono text-xs">{conflict.path}</span>
            </div>
          {/each}
        </div>
        <button on:click={resolveConflicts} class="text-xs uppercase tracking-widest font-bold text-[var(--red)] hover:opacity-60">
          Mark Resolved (delete _conflicts/)
        </button>
      </section>
    {/if}

  </div>
</div>
