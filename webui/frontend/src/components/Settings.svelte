<script>
  import { onMount } from 'svelte';
  import ConflictResolver from './ConflictResolver.svelte';
  import { themes } from '../lib/themes.js';
  import { fontOptions, fontSizeOptions, editorFontSizeOptions } from '../lib/fonts.js';
  import { isSupportedLocale, locale, localeOptions, localizedText, uiText } from '../lib/strings.js';
  import { activeTheme, themeMode, fontFamily, fontSize, editorFontSize, editorState } from '../stores.js';

  const DEFAULT_GIT_OWNER = 'Monos';
  const themeModeOptions = [
    { value: 'system', label: () => $localizedText.settings.themeModeSystem },
    { value: 'light', label: () => $localizedText.settings.themeModeLight },
    { value: 'dark', label: () => $localizedText.settings.themeModeDark },
  ];

  let settings = {
    auto_sync_interval: 0,
    auto_format_on_save: false,
    git_commit_message: uiText.settings.defaultCommitMessage,
    git_token: '',
    git_owner: DEFAULT_GIT_OWNER,
    git_repo: '',
    git_branch: 'main',
    device_name: '',
    locale: 'en',
  };

  let gitStatus = null;
  let gitRepos = [];
  let gitBranches = [];
  let gitConflicts = [];
  let conflictDetails = [];
  let showConflictResolver = false;
  let conflictIndex = 0;
  let isLoadingRepos = false;
  let isLoadingBranches = false;
  let isConnecting = false;
  let isSettingUp = false;
  let isAuthenticated = false;
  let isSyncing = false;
  let isCheckingStatus = false;
  let gitError = '';

  function getSelectedRepoFullName() {
    if (!settings.git_repo) return '';
    if (settings.git_repo.includes('/')) return settings.git_repo;
    if (settings.git_owner) return `${settings.git_owner}/${settings.git_repo}`;
    return settings.git_repo;
  }

  function normalizeRepoList(payload) {
    return Array.isArray(payload) ? payload : [];
  }

  function normalizeBranchList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.branches)) return payload.branches;
    return [];
  }

  function normalizeConflictList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.conflicts)) return payload.conflicts;
    return [];
  }

  function getRepoOptionValue(repo) {
    if (typeof repo === 'string') return repo;
    return repo.full_name || repo.name || '';
  }

  function getRepoOptionLabel(repo) {
    if (typeof repo === 'string') return repo;
    return repo.full_name || repo.name || '';
  }

  function getConflictLabel(conflict) {
    if (typeof conflict === 'string') return conflict;
    return conflict?.path || '';
  }

  async function loadSettings() {
    try {
      const r = await fetch('/api/settings');
      if (r.ok) {
        const saved = await r.json();
        settings = { ...settings, ...saved };
        if (saved.theme && themes[saved.theme]) $activeTheme = saved.theme;
        if (['system', 'light', 'dark'].includes(saved.themeMode)) $themeMode = saved.themeMode;
        if (saved.fontFamily) $fontFamily = saved.fontFamily;
        if (saved.fontSize) $fontSize = saved.fontSize;
        if (isSupportedLocale(saved.locale)) $locale = saved.locale;
      }
    } catch (e) { console.error(e); }

    if (settings.git_token) {
      isAuthenticated = true;
      await fetchRepos();
      if (settings.git_repo) {
        await loadBranches();
      }
    }
  }

  async function saveSettings() {
    try {
      const payload = { ...settings, theme: $activeTheme, themeMode: $themeMode, fontFamily: $fontFamily, fontSize: $fontSize, editorFontSize: $editorFontSize, locale: $locale };
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
      if (r.ok) gitRepos = normalizeRepoList(await r.json());
    } catch (e) { console.error(e); }
    finally { isLoadingRepos = false; }
  }

  async function authenticate() {
    if (!settings.git_token.trim()) return;
    isConnecting = true; gitError = '';
    try {
      const userR = await fetch(`/api/git/user?token=${encodeURIComponent(settings.git_token)}`);
      if (!userR.ok) { gitError = $localizedText.settings.invalidToken; return; }
      settings.git_owner = (await userR.json()).login;
      const reposR = await fetch(`/api/git/repos?token=${encodeURIComponent(settings.git_token)}`);
      if (!reposR.ok) { gitError = $localizedText.settings.failedToFetchRepos; return; }
      gitRepos = normalizeRepoList(await reposR.json());
      isAuthenticated = true;
      if (gitRepos.length === 1) settings.git_repo = getRepoOptionValue(gitRepos[0]);
      await saveSettings();
      if (settings.git_repo) await loadBranches();
    } catch (e) { gitError = e.message; }
    finally { isConnecting = false; }
  }

  async function onRepoChange() {
    const repoFullName = getSelectedRepoFullName();
    if (repoFullName.includes('/')) settings.git_owner = repoFullName.split('/')[0];
    await saveSettings();
    if (settings.git_repo) await loadBranches();
  }

  async function loadBranches() {
    const repoFullName = getSelectedRepoFullName();
    if (!settings.git_token || !repoFullName) return;
    isLoadingBranches = true;
    try {
      const r = await fetch(`/api/git/branches?token=${encodeURIComponent(settings.git_token)}&repo=${encodeURIComponent(repoFullName)}`);
      if (r.ok) {
        gitBranches = normalizeBranchList(await r.json());
        if (gitBranches.length && !gitBranches.includes(settings.git_branch))
          settings.git_branch = gitBranches[0];
      }
    } catch (e) { console.error(e); }
    finally { isLoadingBranches = false; }
  }

  async function setupGitRepo() {
    const repoFullName = getSelectedRepoFullName();
    if (!settings.git_token || !repoFullName) return;
    isSettingUp = true;
    gitError = '';
    try {
      await saveSettings();
      const r = await fetch('/api/git/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: settings.git_token, owner: settings.git_owner, repo: repoFullName, branch: settings.git_branch, device_name: settings.device_name })
      });
      if (r.ok) await checkGitStatus();
      else gitError = (await r.json()).detail;
    } catch (e) { console.error(e); }
    finally { isSettingUp = false; }
  }

  async function handleSync() {
    if ($editorState.saving || $editorState.dirty) {
      gitError = $editorState.saving
        ? $localizedText.settings.waitForSaveBeforeSync
        : $localizedText.settings.saveBeforeSync;
      return;
    }
    isSyncing = true;
    try {
      const r = await fetch('/api/git/sync', { method: 'POST' });
      const data = await r.json();
      if (r.ok) await checkGitStatus();
      if (data.conflicts === true) await loadConflicts();
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
      if (r.ok) {
        const data = await r.json();
        if (data.length > 0 && data[0].ours !== undefined) {
          conflictDetails = data;
          gitConflicts = data.map(d => d.path);
        } else {
          gitConflicts = normalizeConflictList(data);
          conflictDetails = gitConflicts.map(p => ({ path: p, ours: '', theirs: '' }));
        }
      }
    } catch (e) { console.error(e); }
  }

  async function handleConflictResolve(event) {
    const { path: filePath, choice } = event.detail;
    try {
      await fetch('/api/git/conflicts/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutions: { [filePath]: choice } })
      });
      conflictDetails = conflictDetails.filter(c => c.path !== filePath);
      gitConflicts = gitConflicts.filter(p => p !== filePath);
      if (conflictIndex >= conflictDetails.length) conflictIndex = Math.max(0, conflictDetails.length - 1);
      if (conflictDetails.length === 0) {
        showConflictResolver = false;
        await checkGitStatus();
      }
    } catch (e) { console.error(e); }
  }

  function openConflictResolver() {
    conflictIndex = 0;
    showConflictResolver = true;
  }

  function initSettingsPage() {
    loadSettings();
    checkGitStatus();
    loadConflicts();
  }

  onMount(initSettingsPage);
</script>

<div class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8">
  <div class="mx-auto w-full max-w-5xl space-y-10">

    <div>
      <h1 class="text-3xl lg:text-4xl font-serif tracking-tight">{$localizedText.settings.title}</h1>
    </div>

    <!-- Language -->
    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.language}</h2>
      <div>
        <label for="interface-language" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.interfaceLanguage}</label>
        <select
          id="interface-language"
          bind:value={$locale}
          on:change={saveSettings}
          class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm appearance-none cursor-pointer"
        >
          {#each localeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
    </section>

    <!-- Theme -->
    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.theme}</h2>
      <div>
        <div class="mb-2 block text-xs text-[var(--text-secondary)]">{$localizedText.settings.themeMode}</div>
        <div class="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/25 p-1">
          {#each themeModeOptions as option}
            <button
              type="button"
              on:click={() => { $themeMode = option.value; saveSettings(); }}
              class="min-h-9 rounded-xl px-3 text-xs font-bold uppercase tracking-[0.12em] transition {$themeMode === option.value ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-sm shadow-black/10' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
            >
              {option.label()}
            </button>
          {/each}
        </div>
      </div>
      <div>
        <div class="mb-2 block text-xs text-[var(--text-secondary)]">{$localizedText.settings.colorTheme}</div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
      </div>
    </section>

    <!-- Font -->
    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.typography}</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <div class="min-w-0">
          <label for="font-family" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.font}</label>
          <select
            id="font-family"
            value={$fontFamily}
            on:change={(e) => { $fontFamily = e.target.value; saveSettings(); }}
            class="w-full min-w-0 truncate bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm appearance-none cursor-pointer"
          >
            {#each fontOptions as f}
              <option value={f.name}>{f.name} ({f.category})</option>
            {/each}
          </select>
        </div>
        <div class="min-w-0">
          <label for="font-size" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.size}</label>
          <select
            id="font-size"
            value={$fontSize}
            on:change={(e) => { $fontSize = e.target.value; saveSettings(); }}
            class="w-full min-w-0 truncate bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm appearance-none cursor-pointer"
          >
            {#each fontSizeOptions as s}
              <option value={s.value}>{s.name} ({s.base})</option>
            {/each}
          </select>
        </div>
      </div>
    </section>

    <!-- Editor Preferences -->
    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.editor}</h2>
      <div class="min-w-0">
        <label for="editor-font-size" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.fontSize}</label>
        <select
          id="editor-font-size"
          value={$editorFontSize}
          on:change={(e) => { $editorFontSize = e.target.value; saveSettings(); }}
          class="w-full min-w-0 truncate bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm appearance-none cursor-pointer"
        >
          {#each editorFontSizeOptions as s}
            <option value={s.value}>{s.name} ({s.base})</option>
          {/each}
        </select>
      </div>
    </section>

    <!-- GitHub Connection -->
    <section class="space-y-5 pt-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.githubConnection}</h2>

      <!-- Help -->
      <details class="text-xs text-[var(--text-secondary)] group">
        <summary class="cursor-pointer hover:text-[var(--text-primary)] transition-colors">{$localizedText.settings.tokenHelp}</summary>
        <div class="mt-3 space-y-2 p-3 border border-[var(--border-subtle)] rounded leading-relaxed">
          <p>{$localizedText.settings.tokenHelpSteps[0]} <a href="https://github.com/settings/tokens" target="_blank" class="underline hover:opacity-60">{$localizedText.settings.tokenHelpUrl}</a></p>
          {#each $localizedText.settings.tokenHelpSteps.slice(1) as step}
            <p>{step}</p>
          {/each}
          <p class="pt-1 text-[var(--text-muted)]">{$localizedText.settings.tokenHelpNote}</p>
        </div>
      </details>

      <form on:submit|preventDefault={authenticate} class="mt-8 space-y-1.5">
        <label for="git-token" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.personalAccessToken}</label>
        <div class="flex gap-3">
          <input type="text" name="username" autocomplete="username" value="token" class="hidden" aria-hidden="true" tabindex="-1" />
          <input type="password" name="token" id="git-token" autocomplete="new-password" bind:value={settings.git_token} placeholder={$localizedText.settings.tokenPlaceholder} class="flex-1 bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)] text-sm" disabled={isAuthenticated} />
          {#if isAuthenticated}
            <button type="button" on:click={() => { isAuthenticated = false; settings.git_token = ''; settings.git_owner = DEFAULT_GIT_OWNER; settings.git_repo = ''; gitRepos = []; gitBranches = []; }} class="text-xs uppercase tracking-widest font-bold shrink-0 text-[var(--red)]">{$localizedText.settings.reset}</button>
          {:else}
            <button type="submit" disabled={isConnecting || !settings.git_token} class="text-xs uppercase tracking-widest font-bold hover:opacity-60 disabled:opacity-30 shrink-0">
              {isConnecting ? $localizedText.settings.connecting : $localizedText.settings.authenticate}
            </button>
          {/if}
        </div>
      </form>

      {#if gitError}
        <div class="text-xs text-[var(--red)] bg-[var(--bg-secondary)] px-3 py-2 rounded">{gitError}</div>
      {/if}

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="git-owner" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.owner}</label>
          <input type="text" id="git-owner" bind:value={settings.git_owner} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm {isAuthenticated ? 'opacity-50' : ''}" disabled={isAuthenticated} />
        </div>
        <div>
          <label for="git-repository" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.repository}</label>
          <select id="git-repository" bind:value={settings.git_repo} on:change={onRepoChange} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm appearance-none cursor-pointer" disabled={!gitRepos.length}>
            <option value="">{$localizedText.settings.select}</option>
            {#each gitRepos as r}
              <option value={getRepoOptionValue(r)}>{getRepoOptionLabel(r)}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="git-branch" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.branch}</label>
          <select id="git-branch" bind:value={settings.git_branch} on:change={saveSettings} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none text-sm appearance-none cursor-pointer">
            {#if isLoadingBranches}
              <option>{$localizedText.settings.loading}</option>
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
          <label for="device-name" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.deviceName}</label>
          <input id="device-name" type="text" bind:value={settings.device_name} on:change={saveSettings} placeholder={$localizedText.settings.devicePlaceholder} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)] text-sm" />
        </div>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          on:click={setupGitRepo}
          disabled={isSettingUp || !settings.git_token || !getSelectedRepoFullName()}
          class="text-xs uppercase tracking-widest font-bold px-5 py-2.5 border border-[var(--border-subtle)] hover:border-[var(--text-primary)] transition disabled:opacity-30"
        >
          {isSettingUp ? $localizedText.settings.connecting : $localizedText.settings.connectRepository}
        </button>
      </div>
    </section>

    <!-- Sync Settings -->
    <section class="space-y-5 border-t border-[var(--border-subtle)] pt-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.syncSettings}</h2>

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="auto-sync-interval" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.autoSyncInterval}</label>
          <input id="auto-sync-interval" type="number" bind:value={settings.auto_sync_interval} on:change={saveSettings} min="0" class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)] text-sm" />
          <p class="text-[10px] text-[var(--text-secondary)] mt-1">{$localizedText.settings.autoSyncHint}</p>
        </div>
        <div>
          <label for="git-commit-message" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.commitMessage}</label>
          <input id="git-commit-message" type="text" bind:value={settings.git_commit_message} on:change={saveSettings} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)] text-sm" />
        </div>
      </div>

      <div class="flex items-center gap-3">
        <input type="checkbox" id="auto-format" bind:checked={settings.auto_format_on_save} on:change={saveSettings} class="accent-[var(--text-primary)]" />
        <label for="auto-format" class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.autoFormatOnSave}</label>
      </div>
    </section>

    <!-- Status & Sync -->
    <section class="space-y-4 border-t border-[var(--border-subtle)] pt-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.statusAndSync}</h2>

      <div class="border border-[var(--border-subtle)] rounded p-5">
        {#if isCheckingStatus}
          <div class="text-xs animate-pulse text-[var(--text-secondary)]">{$localizedText.settings.checking}</div>
        {:else if gitStatus?.initialized}
          <div class="flex items-center justify-between">
            <div class="space-y-1.5 text-sm">
              <div class="flex items-center gap-2.5">
                <span class="w-2 h-2 rounded-full" class:bg-[var(--green)]={gitStatus.status === 'clean'} class:bg-[var(--yellow)]={gitStatus.status === 'dirty' || gitStatus.ahead > 0} class:bg-[var(--red)]={gitStatus.status === 'conflict' || gitStatus.behind > 0}></span>
                <span class="font-medium">{gitStatus.current_branch}</span>
                <span class="text-[var(--text-secondary)]">({gitStatus.status})</span>
              </div>
              {#if gitStatus.ahead > 0}<div class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.ahead(gitStatus.ahead)}</div>{/if}
              {#if gitStatus.behind > 0}<div class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.behind(gitStatus.behind)}</div>{/if}
              {#if gitStatus.last_sync}<div class="text-[10px] text-[var(--text-muted)]">{$localizedText.settings.lastSync(gitStatus.last_sync)}</div>{/if}
            </div>
            <button on:click={handleSync} disabled={isSyncing || $editorState.saving || $editorState.dirty} class="text-xs uppercase tracking-widest font-bold px-5 py-2.5 border border-[var(--border-subtle)] hover:border-[var(--text-primary)] transition disabled:opacity-30">
              {isSyncing ? $localizedText.settings.syncing : $localizedText.settings.syncNow}
            </button>
          </div>
        {:else if gitStatus && !gitStatus.initialized}
          <div class="text-sm text-[var(--text-secondary)]">{$localizedText.settings.notInitialized}</div>
        {:else}
          <div class="text-sm text-[var(--text-secondary)]">{$localizedText.settings.loadingStatus}</div>
        {/if}
      </div>

      <div class="flex gap-4 text-xs">
        <button on:click={checkGitStatus} class="uppercase tracking-widest hover:opacity-60 transition">{$localizedText.settings.refreshStatus}</button>
        <button on:click={loadConflicts} class="uppercase tracking-widest hover:opacity-60 transition">{$localizedText.settings.viewConflicts}</button>
      </div>
    </section>

    <!-- Conflicts -->
    {#if gitConflicts.length > 0}
      <section class="space-y-4 pt-2">
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.conflicts(gitConflicts.length)}</h2>
        <div class="border border-[var(--border-subtle)] rounded p-4 space-y-2 max-h-48 overflow-y-auto">
          {#each gitConflicts as conflict}
            <div class="flex items-center justify-between py-1 text-sm border-b border-[var(--border-subtle)] last:border-0">
              <span class="truncate font-mono text-xs">{getConflictLabel(conflict)}</span>
            </div>
          {/each}
        </div>
        <button on:click={openConflictResolver} class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--text-secondary)] transition">
          Resolve Conflicts
        </button>
      </section>
    {/if}

  </div>
</div>

{#if showConflictResolver && conflictDetails.length > 0}
  <ConflictResolver
    conflicts={conflictDetails}
    currentIndex={conflictIndex}
    on:resolve={handleConflictResolve}
    on:done={() => { showConflictResolver = false; }}
  />
{/if}
