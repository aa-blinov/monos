<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import ConflictResolver from './ConflictResolver.svelte';
  import Checkbox from './Checkbox.svelte';
  import { themes } from '../lib/themes.js';
  import { fontOptions, fontSizeOptions, editorFontSizeOptions } from '../lib/fonts.js';
  import { isSupportedLocale, locale, localeOptions, localizedText, uiText } from '../lib/strings.js';
  import { activeTheme, themeMode, fontFamily, fontSize, editorFontSize, editorState } from '../stores.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { exportNotesArchive, importNotesArchive } from '../lib/backup.js';
  import { formatAttachmentSize as humanSize, fetchOrphanAttachments } from '../lib/attachments.js';
  import { printTreeToPdf } from '../lib/print.js';
  import { fetchClipperToken } from '../lib/clipper.js';
  import { fetchNotesDir } from '../lib/info.js';
  import appPackage from '../../../../package.json';

  const dispatch = createEventDispatcher();
  const DEFAULT_GIT_OWNER = 'Monos';
  const appVersion = appPackage.version;
  const themeModeOptions = [
    { value: 'system', label: () => $localizedText.settings.themeModeSystem },
    { value: 'light', label: () => $localizedText.settings.themeModeLight },
    { value: 'dark', label: () => $localizedText.settings.themeModeDark },
  ];

  $: localizedFontSizeOptions = fontSizeOptions.map(option => ({
    ...option,
    label: $localizedText.optionLabels.fontSize[option.value] || option.name,
  }));
  $: localizedEditorFontSizeOptions = editorFontSizeOptions.map(option => ({
    ...option,
    label: $localizedText.optionLabels.fontSize[option.value] || option.name,
  }));

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
  let isExporting = false;
  let isImporting = false;
  let orphans = [];
  let orphanStatus = 'loading';
  let orphanTotalSize = 0;
  let backupStatus = '';
  let backupError = '';
  let selectedArchiveName = '';
  let printStatus = '';
  let printError = '';
  let clipperToken = '';
  let clipperError = '';
  let showClipperToken = false;
  let repoSafety = null;
  let scopeWarnings = [];
  let notesDir = '';

  onMount(async () => {
    try { notesDir = await fetchNotesDir(); } catch { notesDir = ''; }
    loadOrphanAttachments();
  });

  async function loadOrphanAttachments() {
    try {
      const data = await fetchOrphanAttachments();
      orphans = data.orphans || [];
      orphanTotalSize = data.totalSize || 0;
      orphanStatus = 'ready';
    } catch {
      orphanStatus = 'error';
    }
  }

  async function printAllNotes() {
    printStatus = '';
    printError = '';
    try {
      await printTreeToPdf('');
      printStatus = $localizedText.settings.printReady;
    } catch (error) {
      printError = $localizedText.settings.backupError(error?.message || String(error));
    }
  }

  async function revealClipperToken() {
    clipperError = '';
    try {
      clipperToken = await fetchClipperToken();
      showClipperToken = true;
    } catch (error) {
      clipperError = $localizedText.settings.clipperError(error?.message || String(error));
    }
  }
  let archiveInput;
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
      if (settings.git_repo) { await loadBranches(); await checkRepoSafety(); }
    } catch (e) { gitError = e.message; }
    finally { isConnecting = false; }
  }

  async function onRepoChange() {
    const repoFullName = getSelectedRepoFullName();
    if (repoFullName.includes('/')) settings.git_owner = repoFullName.split('/')[0];
    await saveSettings();
    if (settings.git_repo) {
      await loadBranches();
      await checkRepoSafety();
    }
  }

  /**
   * Ask GitHub what this repository and this token actually allow, before
   * anything is pushed. A public repo makes the whole vault public text, and
   * history keeps it public after a note is deleted — that is a one-way door
   * worth one extra request.
   */
  async function checkRepoSafety() {
    repoSafety = null;
    scopeWarnings = [];
    const repo = getSelectedRepoFullName();
    if (!repo.includes('/') || !settings.git_token) return;
    try {
      const res = await fetch(`/api/git/repo-check?token=${encodeURIComponent(settings.git_token)}&repo=${encodeURIComponent(repo)}`);
      if (!res.ok) return;
      repoSafety = await res.json();
      scopeWarnings = repoSafety.scopeWarnings || [];
    } catch {
      repoSafety = null;
    }
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


  async function exportNotes() {
    isExporting = true;
    backupStatus = '';
    backupError = '';
    try {
      const name = await exportNotesArchive({
        onError: (message) => { backupError = $localizedText.settings.backupError(message); },
      });
      if (name) backupStatus = $localizedText.settings.exportComplete;
    } catch (error) {
      backupError = $localizedText.settings.backupError(error.message);
    } finally {
      isExporting = false;
    }
  }

  async function importArchive(file) {
    if (!file) return;
    isImporting = true;
    backupStatus = '';
    backupError = '';
    try {
      const result = await importNotesArchive(file);
      if (!result.ok) throw new Error(result.detail || $localizedText.settings.importFailed);
      backupStatus = $localizedText.settings.importComplete(result.data);
      dispatch('notesImported', result.data);
    } catch (error) {
      backupError = $localizedText.settings.backupError(error.message);
    } finally {
      isImporting = false;
    }
  }

  async function handleImportChange(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    selectedArchiveName = file?.name || '';
    await importArchive(file);
    input.value = '';
    if (!isImporting) selectedArchiveName = '';
  }

  function openArchivePicker() {
    if (isImporting) return;
    dispatch('archivePickerOpened');
    archiveInput?.click();
  }

  async function checkGitStatus() {
    isCheckingStatus = true;
    try {
      const r = await fetch('/api/git/status');
      if (r.ok) {
        gitStatus = await r.json();
        if (gitStatus?.status === 'conflict') {
          await loadConflicts();
        } else {
          gitConflicts = [];
          conflictDetails = [];
          showConflictResolver = false;
        }
      }
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
  }

  onMount(initSettingsPage);
</script>

<div class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8">
  <div class="mx-auto w-full max-w-5xl">

    <div class="mb-7">
      <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.settings.title}</h1>
      <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
        {$localizedText.settings.hint}
      </p>
    </div>

    <div class="space-y-8">

    <!-- Language -->
    <section class="space-y-4 border-t border-[var(--border-subtle)] pt-5 pb-2">
      <div>
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.backup}</h2>
        <p class="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">{$localizedText.settings.backupHint}</p>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <div class="min-w-0">
          <div class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.settings.exportTitle}</div>
          <div class="flex flex-wrap gap-3">
          <button
            type="button"
            on:click={printAllNotes}
            disabled={isExporting || isImporting}
            class="text-xs uppercase tracking-widest font-bold px-5 py-2.5 border border-[var(--border-subtle)] hover:border-[var(--text-primary)] transition disabled:opacity-30"
          >
            {$localizedText.settings.printAllNotes}
          </button>
          <button
            type="button"
            on:click={exportNotes}
            disabled={isExporting}
            class="text-xs uppercase tracking-widest font-bold px-5 py-2.5 border border-[var(--border-subtle)] hover:border-[var(--text-primary)] transition disabled:opacity-30"
          >
            {isExporting ? $localizedText.settings.exporting : $localizedText.settings.exportNotes}
          </button>
          </div>
        </div>

        <div class="min-w-0">
          <div id="notes-import-archive-label" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.settings.importTitle}</div>
          <div class="flex flex-wrap items-center gap-3">
            <input
              id="notes-import-archive"
              bind:this={archiveInput}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              disabled={isImporting}
              aria-labelledby="notes-import-archive-label"
              on:change={handleImportChange}
              class="sr-only"
            />
            <button
              type="button"
              on:click={openArchivePicker}
              disabled={isImporting}
              class="text-xs uppercase tracking-widest font-bold px-5 py-2.5 border border-[var(--border-subtle)] hover:border-[var(--text-primary)] transition disabled:opacity-30"
            >
              {isImporting ? $localizedText.settings.importing : $localizedText.settings.chooseArchive}
            </button>
            <span class="max-w-full truncate text-xs text-[var(--text-secondary)]">{selectedArchiveName || $localizedText.settings.noArchiveSelected}</span>
          </div>
        </div>
      </div>

      {#if printStatus}
        <div class="text-xs text-[var(--text-tertiary)]">{printStatus}</div>
      {/if}
      {#if printError}
        <div class="text-xs text-[var(--red)]">{printError}</div>
      {/if}
      {#if backupStatus}
        <div class="text-xs text-[var(--green)]">{backupStatus}</div>
      {/if}
      {#if backupError}
        <div class="text-xs text-[var(--red)]">{backupError}</div>
      {/if}
    </section>

    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.attachmentsTitle}</h2>
      {#if orphanStatus === 'loading'}
        <div class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.attachmentsLoading}</div>
      {:else if orphanStatus === 'error'}
        <div class="text-xs text-[var(--red)]">{$localizedText.settings.attachmentsError}</div>
      {:else if orphans.length === 0}
        <div class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.attachmentsClean}</div>
      {:else}
        <div class="text-xs text-[var(--text-secondary)]">
          {$localizedText.settings.attachmentsFound.replace('{count}', orphans.length).replace('{size}', humanSize(orphanTotalSize))}
        </div>
        <ul class="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)]" data-testid="orphan-attachments">
          {#each orphans as orphan (orphan.path)}
            <li class="flex items-center justify-between gap-3 px-3 py-2">
              <span class="min-w-0">
                <span class="block truncate text-xs text-[var(--text-primary)]">{orphan.name}</span>
                <span class="block truncate text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">{orphan.folder}</span>
              </span>
              <span class="shrink-0 text-xs text-[var(--text-tertiary)]">{humanSize(orphan.size)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.language}</h2>
      <div>
        <label for="interface-language" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.interfaceLanguage}</label>
        <select
          id="interface-language"
          bind:value={$locale}
          on:change={saveSettings}
          class={formFieldClass({ extraClass: 'appearance-none cursor-pointer' })}
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
        <div class="grid grid-cols-3 gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/25 p-1">
          {#each themeModeOptions as option}
            <button
              type="button"
              on:click={() => { $themeMode = option.value; saveSettings(); }}
              class="min-h-9 px-3 text-xs uppercase tracking-[0.12em] transition {$themeMode === option.value ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
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
            class={formFieldClass({ extraClass: 'appearance-none cursor-pointer' })}
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
            class={formFieldClass({ extraClass: 'appearance-none cursor-pointer' })}
          >
            {#each localizedFontSizeOptions as s}
              <option value={s.value}>{s.label} ({s.base})</option>
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
          class={formFieldClass({ extraClass: 'appearance-none cursor-pointer' })}
        >
          {#each localizedEditorFontSizeOptions as s}
            <option value={s.value}>{s.label} ({s.base})</option>
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
        <div class="mt-3 space-y-2 rounded-xl border border-[var(--border-subtle)] p-3 leading-relaxed">
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
          <input type="password" name="token" id="git-token" autocomplete="new-password" bind:value={settings.git_token} placeholder={$localizedText.settings.tokenPlaceholder} class="flex-1 {formFieldClass({ extraClass: 'focus:border-[var(--text-primary)]' })}" disabled={isAuthenticated} />
          {#if isAuthenticated}
            <button type="button" on:click={() => { isAuthenticated = false; settings.git_token = ''; settings.git_owner = DEFAULT_GIT_OWNER; settings.git_repo = ''; gitRepos = []; gitBranches = []; }} class="text-xs uppercase tracking-widest font-bold shrink-0 text-[var(--red)]">{$localizedText.settings.reset}</button>
          {:else}
            <button type="submit" disabled={isConnecting || !settings.git_token} class="text-xs uppercase tracking-widest font-bold hover:opacity-60 disabled:opacity-30 shrink-0">
              {isConnecting ? $localizedText.settings.connecting : $localizedText.settings.authenticate}
            </button>
          {/if}
        </div>
      </form>

      {#if repoSafety && !repoSafety.safe}
        <div class="border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3">
          <p class="text-sm font-bold text-[var(--red)]">{$localizedText.settings.publicRepoTitle}</p>
          <p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{$localizedText.settings.publicRepoHint}</p>
        </div>
      {/if}

      {#if scopeWarnings.length}
        <div class="border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-3">
          <p class="text-xs font-bold text-[var(--text-primary)]">{$localizedText.settings.tokenScopeTitle}</p>
          <ul class="mt-1.5 space-y-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {#each scopeWarnings as warning}
              <li><code class="text-[var(--text-primary)]">{warning.scope}</code> — {warning.why}</li>
            {/each}
          </ul>
          <p class="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.settings.tokenScopeHint}</p>
        </div>
      {/if}

      {#if gitError}
        <div class="text-xs rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-[var(--red)]">{gitError}</div>
      {/if}

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="git-owner" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.owner}</label>
          <input type="text" id="git-owner" bind:value={settings.git_owner} class={formFieldClass({ extraClass: isAuthenticated ? 'opacity-50' : '' })} disabled={isAuthenticated} />
        </div>
        <div>
          <label for="git-repository" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.repository}</label>
          <select id="git-repository" bind:value={settings.git_repo} on:change={onRepoChange} class={formFieldClass({ extraClass: 'appearance-none cursor-pointer' })} disabled={!gitRepos.length}>
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
          <select id="git-branch" bind:value={settings.git_branch} on:change={saveSettings} class={formFieldClass({ extraClass: 'appearance-none cursor-pointer' })}>
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
          <input id="device-name" type="text" bind:value={settings.device_name} on:change={saveSettings} placeholder={$localizedText.settings.devicePlaceholder} class={formFieldClass()} />
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
          <input id="auto-sync-interval" type="number" bind:value={settings.auto_sync_interval} on:change={saveSettings} min="0" class={formFieldClass({ extraClass: 'focus:border-[var(--text-primary)]' })} />
          <p class="text-[length:var(--text-whisper)] text-[var(--text-secondary)] mt-1">{$localizedText.settings.autoSyncHint}</p>
        </div>
        <div>
          <label for="git-commit-message" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.commitMessage}</label>
          <input id="git-commit-message" type="text" bind:value={settings.git_commit_message} on:change={saveSettings} class={formFieldClass()} />
        </div>
      </div>

      <div class="flex items-center">
        <Checkbox
          id="auto-format"
          bind:checked={settings.auto_format_on_save}
          on:change={saveSettings}
        >
          {$localizedText.settings.autoFormatOnSave}
        </Checkbox>
      </div>
    </section>

    <!-- Status & Sync -->
    <section class="space-y-4 border-t border-[var(--border-subtle)] pt-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.statusAndSync}</h2>

      <div class="border rounded-lg border border-[var(--border-subtle)] p-5">
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
              {#if gitStatus.last_sync}<div class="text-[length:var(--text-whisper)] text-[var(--text-muted)]">{$localizedText.settings.lastSync(gitStatus.last_sync)}</div>{/if}
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
        {#if gitConflicts.length > 0}
          <button on:click={loadConflicts} class="uppercase tracking-widest hover:opacity-60 transition">{$localizedText.settings.viewConflicts}</button>
        {/if}
      </div>
    </section>

    <!-- Conflicts -->
    {#if gitConflicts.length > 0}
      <section class="space-y-4 pt-2">
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.conflicts(gitConflicts.length)}</h2>
        <div class="border rounded-lg border border-[var(--border-subtle)] p-4 space-y-2 max-h-48 overflow-y-auto">
          {#each gitConflicts as conflict}
            <div class="flex items-center justify-between py-1 text-sm border-b border-[var(--border-subtle)] last:border-0">
              <span class="truncate font-mono text-xs">{getConflictLabel(conflict)}</span>
            </div>
          {/each}
        </div>
        <button on:click={openConflictResolver} class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--text-secondary)] transition">
          {$localizedText.settings.resolveConflicts}
        </button>
      </section>
    {/if}

    <!-- Backup -->


    <!-- Web clipper -->
    <section class="space-y-4 border-t border-[var(--border-subtle)] pt-5 pb-2">
      <div>
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.clipper}</h2>
        <p class="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">{$localizedText.settings.clipperHint}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          on:click={revealClipperToken}
          disabled={showClipperToken}
          class="text-xs uppercase tracking-widest font-bold px-5 py-2.5 border border-[var(--border-subtle)] hover:border-[var(--text-primary)] transition disabled:opacity-30"
        >
          {$localizedText.settings.clipperShowToken}
        </button>
        {#if showClipperToken}
          <div class="min-w-0 flex-1 space-y-1">
            <div class="text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{$localizedText.settings.clipperEndpoint}</div>
            <code class="block break-all border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-2.5 text-xs text-[var(--text-primary)]">{window.location.origin}</code>
            <div class="text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{$localizedText.settings.clipperTokenLabel}</div>
            <code class="block break-all border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-2.5 text-xs text-[var(--text-primary)]">{clipperToken}</code>
          </div>
        {/if}
      </div>
      {#if clipperError}
        <div class="text-xs text-[var(--red)]">{clipperError}</div>
      {/if}
    </section>



    <!-- Documentation -->
    <section class="space-y-6 border-t border-[var(--border-subtle)] pt-5 pb-2">
      <div>
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.documentation}</h2>
        <p class="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.settings.documentationHint}</p>
      </div>

      <div>
        <h3 class="mb-2 text-xs uppercase tracking-[0.16em] font-bold text-[var(--text-tertiary)]">{$localizedText.settings.docsGettingStarted}</h3>
        <ol class="space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          <li class="flex gap-3"><span class="text-[var(--text-muted)]">1</span><span><span class="font-bold text-[var(--text-primary)]">{$localizedText.settings.docsStepNew}</span> — {$localizedText.settings.docsStepNewHint}</span></li>
          <li class="flex gap-3"><span class="text-[var(--text-muted)]">2</span><span><span class="font-bold text-[var(--text-primary)]">{$localizedText.settings.docsStepImport}</span> — {$localizedText.settings.docsStepImportHint}</span></li>
          <li class="flex gap-3"><span class="text-[var(--text-muted)]">3</span><span><span class="font-bold text-[var(--text-primary)]">{$localizedText.settings.docsStepBackup}</span> — {$localizedText.settings.docsStepBackupHint}</span></li>
        </ol>
      </div>

      <div>
        <h3 class="mb-2 text-xs uppercase tracking-[0.16em] font-bold text-[var(--text-tertiary)]">{$localizedText.settings.docsKeyboard}</h3>
        <dl class="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          {#each [['Ctrl+K', $localizedText.settings.docsShortcutCommands], ['Ctrl+O', $localizedText.settings.docsShortcutOpen], ['Ctrl+B', $localizedText.settings.docsShortcutSidebar], ['Ctrl+Shift+F', $localizedText.settings.docsShortcutSearch], ['Ctrl+S', $localizedText.settings.docsShortcutSave]] as [keys, label]}
            <dt class="tabular-nums text-[var(--text-primary)]">{keys}</dt>
            <dd class="text-[var(--text-secondary)]">{label}</dd>
          {/each}
        </dl>
      </div>

      <div>
        <h3 class="mb-2 text-xs uppercase tracking-[0.16em] font-bold text-[var(--text-tertiary)]">{$localizedText.settings.docsOperators}</h3>
        <p class="mb-2 max-w-2xl text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.settings.docsOperatorsHint}</p>
        <dl class="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          {#each [
              [$localizedText.settings.docsOpTag, $localizedText.settings.docsOpTagHint],
              [$localizedText.settings.docsOpFolder, $localizedText.settings.docsOpFolderHint],
              [$localizedText.settings.docsOpPath, $localizedText.settings.docsOpPathHint],
              [$localizedText.settings.docsOpTitle, $localizedText.settings.docsOpTitleHint],
              [$localizedText.settings.docsOpCreated, $localizedText.settings.docsOpCreatedHint],
              [$localizedText.settings.docsOpNegation, $localizedText.settings.docsOpNegationHint],
            ] as [op, hint]}
            <dt class="tabular-nums text-[var(--text-primary)]">{op}</dt>
            <dd class="text-[var(--text-secondary)]">{hint}</dd>
          {/each}
        </dl>
      </div>

      <div>
        <h3 class="mb-2 text-xs uppercase tracking-[0.16em] font-bold text-[var(--text-tertiary)]">{$localizedText.settings.docsNotesLive}</h3>
        {#if notesDir}
          <code class="block break-all border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-2.5 text-xs text-[var(--text-primary)]">{notesDir}</code>
        {/if}
        <p class="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.settings.docsNotesLiveHint}</p>
      </div>

      <div>
        <h3 class="mb-2 text-xs uppercase tracking-[0.16em] font-bold text-[var(--text-tertiary)]">{$localizedText.settings.docsFileFormat}</h3>
        <ul class="space-y-1.5 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
          <li>{$localizedText.settings.docsFrontmatter}</li>
          <li>{$localizedText.settings.docsWikiLinks}</li>
        </ul>
      </div>
    </section>


    <footer class="border-t border-[var(--border-subtle)] pt-4 pb-1 text-left text-[length:var(--text-whisper)] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
      <span class="opacity-40">{$localizedText.settings.version} {appVersion}</span>
    </footer>

    </div>

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
