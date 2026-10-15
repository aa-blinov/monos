<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import ConflictResolver from './ConflictResolver.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import { shortcutLabel } from '../lib/shortcut-label.js';
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
  import {
    chooseNotesFolderRequest,
    deleteFileRequest,
    forgetNotesFolderRequest,
    loadBrokenLinksRequest,
    loadLanAccessRequest,
    loadMaintenanceRequest,
    loadStorageRequest,
    publishSiteRequest,
    regenerateLanTokenRequest,
    setLanAccessRequest,
  } from '../lib/editor-api.js';
  import { localeDate } from '../lib/date-format.js';
  import appPackage from '../../../../package.json';

  const dispatch = createEventDispatcher();

  // Signing out of GitHub removes the saved token, so it asks first, as other removals do.
  let confirmingGitReset = false;

  function resetGitAuth() {
    confirmingGitReset = false;
    isAuthenticated = false;
    settings.git_token = '';
    settings.git_owner = DEFAULT_GIT_OWNER;
    settings.git_repo = '';
    gitRepos = [];
    gitBranches = [];
  }
  const DEFAULT_GIT_OWNER = 'Monos';
  const appVersion = appPackage.version;
  // Reactive, so the labels follow the interface language without a reload.
  $: themeModeOptions = [
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
  // Closed locked notes whose pictures cannot be checked; while there are any, nothing is listed as unused.
  let orphanLocked = 0;
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
  let connectionStatus = 'loading';
  let connectionReport = {
    broken: [],
    orphans: [],
    orphanCount: 0,
    stale: [],
    staleCount: 0,
    staleDays: 180,
    conflictCopies: [],
    conflictCopyCount: 0,
  };
  // A sync conflict copy waiting for the person's decision. Moving it to the trash waits for a confirmation.
  let copyToTrash = null;
  let copyError = '';
  let publishFolder = '';
  let publishBusy = false;
  let publishStatus = '';
  let publishError = '';
  // Access from other devices. A device that got in with a link sees 'remote' here: the server answers
  // this computer's settings only to this computer.
  let lan = { enabled: false, token: null, urls: [], restartRequired: false };
  let lanStatus = 'loading';
  let lanBusy = false;
  let lanError = '';
  let lanNotice = '';
  let confirmingLanRenew = false;

  onMount(async () => {
    try { notesDir = await fetchNotesDir(); } catch { notesDir = ''; }
    loadOrphanAttachments();
    loadConnectionReport();
    loadLanAccess();
    loadStorage();
  });

  // Where the notes live. A chosen folder opens on the next start; the section says so until then.
  let storage = null;
  let storageStatus = 'loading';
  let storageBusy = false;
  let storageError = '';

  async function loadStorage() {
    try {
      storage = await loadStorageRequest();
      storageStatus = 'ready';
    } catch (error) {
      storageStatus = error?.status === 403 ? 'remote' : 'error';
    }
  }

  // A canceled folder dialog changes nothing; the notes themselves are never moved.
  async function chooseStorage() {
    storageBusy = true;
    storageError = '';
    try {
      const result = await chooseNotesFolderRequest();
      if (!result.canceled) storage = result;
    } catch (error) {
      console.error('Failed to choose the notes folder:', error);
      storageError = storageErrorText(error);
    } finally {
      storageBusy = false;
    }
  }

  async function useDefaultStorage() {
    storageBusy = true;
    storageError = '';
    try {
      storage = await forgetNotesFolderRequest();
    } catch (error) {
      console.error('Failed to go back to the default notes folder:', error);
      storageError = $localizedText.settings.storageFailed;
    } finally {
      storageBusy = false;
    }
  }

  function storageErrorText(error) {
    if (error?.status === 409) return $localizedText.settings.storageInAppOnly;
    if (error?.status === 400) return $localizedText.settings.storageInvalid;
    return $localizedText.settings.storageFailed;
  }

  async function loadLanAccess() {
    try {
      lan = await loadLanAccessRequest();
      lanStatus = 'ready';
    } catch (error) {
      lanStatus = error?.status === 403 ? 'remote' : 'error';
    }
  }

  // The switch and the token change at once; a new address takes effect after a restart.
  async function changeLanAccess(change) {
    lanBusy = true;
    lanError = '';
    lanNotice = '';
    try {
      lan = await change();
    } catch (error) {
      console.error('Failed to change access from other devices:', error);
      lanError = $localizedText.settings.lanFailed;
      lan = { ...lan };
    } finally {
      lanBusy = false;
    }
  }

  async function copyLanUrl(url) {
    lanError = '';
    try {
      await navigator.clipboard.writeText(url);
      lanNotice = $localizedText.settings.lanCopied;
    } catch {
      lanNotice = '';
      lanError = $localizedText.settings.lanCopyFailed;
    }
  }

  function toggleLanAccess(enabled) {
    return changeLanAccess(() => setLanAccessRequest(enabled));
  }

  function renewLanToken() {
    confirmingLanRenew = false;
    return changeLanAccess(() => regenerateLanTokenRequest());
  }

  async function loadOrphanAttachments() {
    try {
      const data = await fetchOrphanAttachments();
      orphans = data.orphans || [];
      orphanTotalSize = data.totalSize || 0;
      orphanLocked = data.lockedNotes || 0;
      orphanStatus = 'ready';
    } catch {
      orphanStatus = 'error';
    }
  }

  // Broken links, notes no link reaches and notes gone quiet. Read-only: a row opens its note.
  async function loadConnectionReport() {
    connectionStatus = 'loading';
    try {
      const [broken, maintenance] = await Promise.all([loadBrokenLinksRequest(), loadMaintenanceRequest()]);
      connectionReport = { ...connectionReport, ...maintenance, broken: Array.isArray(broken) ? broken : [] };
      connectionStatus = 'ready';
    } catch {
      connectionStatus = 'error';
    }
  }

  async function trashConflictCopy() {
    const copy = copyToTrash;
    copyToTrash = null;
    copyError = '';
    try {
      await deleteFileRequest(copy.path);
      await loadConnectionReport();
    } catch (error) {
      console.error('Failed to move the conflict copy to the trash:', error);
      copyError = $localizedText.settings.conflictTrashFailed;
    }
  }

  // Writes the notes as a static site into `<folder>/monos-site`. The folder is typed by the person.
  async function publishNotes() {
    publishBusy = true;
    publishStatus = '';
    publishError = '';
    try {
      const result = await publishSiteRequest(publishFolder.trim());
      publishStatus = $localizedText.settings.publishedTo
        .replace('{pages}', String(result.pages))
        .replace('{path}', result.outputDir);
    } catch (error) {
      console.error('Failed to publish the site:', error);
      publishError = error?.message || $localizedText.settings.publishFailed;
    } finally {
      publishBusy = false;
    }
  }

  function noteNameOf(notePath) {
    return String(notePath || '').split('/').pop().replace(/\.md$/i, '');
  }

  function openNote(notePath) {
    if (!notePath) return;
    dispatch('navigate', { path: notePath, name: noteNameOf(notePath), isDir: false });
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

    <section class="space-y-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.language}</h2>
      <div>
        <label for="interface-language" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.interfaceLanguage}</label>
        <select
          id="interface-language"
          bind:value={$locale}
          on:change={saveSettings}
          class={formFieldClass({ extraClass: 'appearance-none cursor-pointer select-chevron' })}
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
            class="p-4 border text-left transition-colors text-sm {$activeTheme === key ? 'border-[var(--text-primary)] bg-[var(--bg-secondary)]' : 'border-[var(--border-subtle)] hover:border-[var(--text-primary)]'}"
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
            class={formFieldClass({ extraClass: 'appearance-none cursor-pointer select-chevron' })}
          >
            {#each fontOptions as f}
              <option value={f.name}>{f.name} ({$localizedText.optionLabels.fontCategory?.[f.category] || f.category})</option>
            {/each}
          </select>
        </div>
        <div class="min-w-0">
          <label for="font-size" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.size}</label>
          <select
            id="font-size"
            value={$fontSize}
            on:change={(e) => { $fontSize = e.target.value; saveSettings(); }}
            class={formFieldClass({ extraClass: 'appearance-none cursor-pointer select-chevron' })}
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
          class={formFieldClass({ extraClass: 'appearance-none cursor-pointer select-chevron' })}
        >
          {#each localizedEditorFontSizeOptions as s}
            <option value={s.value}>{s.label} ({s.base})</option>
          {/each}
        </select>
      </div>
    </section>

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

    <section class="space-y-5" data-testid="storage-section">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.storageTitle}</h2>
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.storageHint}</p>
      {#if storageStatus === 'remote'}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.storageRemoteOnly}</p>
      {:else if storage}
        <code class="block break-all border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-2.5 text-xs text-[var(--text-primary)]" data-testid="storage-folder">{storage.folder}</code>
        {#if storage.unavailable}
          <p role="alert" class="text-xs text-[var(--red)]">{$localizedText.settings.storageUnavailable.replace('{folder}', storage.unavailable)}</p>
        {:else if storage.restartRequired}
          <p role="status" class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.storageRestart.replace('{folder}', storage.target)}</p>
        {/if}
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={storageBusy}
            data-testid="storage-choose"
            on:click={chooseStorage}
            class="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >{$localizedText.settings.storageChoose}</button>
          {#if storage.target !== storage.defaultFolder}
            <button
              type="button"
              disabled={storageBusy}
              data-testid="storage-reset"
              on:click={useDefaultStorage}
              class="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >{$localizedText.settings.storageReset}</button>
          {/if}
        </div>
      {/if}
      {#if storageError}
        <p role="alert" class="text-xs text-[var(--red)]">{storageError}</p>
      {/if}
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

    <details class="group space-y-8 border-t border-[var(--border-subtle)] pt-6" data-testid="advanced-settings">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-6 [&::-webkit-details-marker]:hidden after:shrink-0 after:text-lg after:leading-none after:text-[var(--text-secondary)] after:content-['+'] group-open:after:content-['−']">
        <span class="block">
          <span class="block text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.advanced}</span>
          <span class="mt-2 block max-w-2xl text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.settings.advancedHint}</span>
        </span>
      </summary>
      <section class="space-y-5" data-testid="publish-section">
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.publishTitle}</h2>
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.publishHint}</p>
        <form class="space-y-2" on:submit|preventDefault={publishNotes}>
          <label class="block space-y-1">
            <span class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.publishFolder}</span>
            <input
              type="text"
              bind:value={publishFolder}
              placeholder="/Users/you/Sites"
              aria-describedby="publish-folder-hint"
              data-testid="publish-folder"
              class={formFieldClass()}
            />
          </label>
          <p id="publish-folder-hint" class="text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.publishFolderHint}</p>
          <button
            type="submit"
            disabled={publishBusy || !publishFolder.trim()}
            data-testid="publish-button"
            class="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >{publishBusy ? $localizedText.settings.publishing : $localizedText.settings.publishButton}</button>
        </form>
        {#if publishStatus}
          <p role="status" class="text-xs text-[var(--green)] break-all">{publishStatus}</p>
        {/if}
        {#if publishError}
          <p role="alert" class="text-xs text-[var(--red)]">{publishError}</p>
        {/if}
      </section>

      <section class="space-y-5" data-testid="lan-section">
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.lanTitle}</h2>
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.lanHint}</p>
        {#if lanStatus === 'remote'}
          <p class="text-xs text-[var(--text-tertiary)]" data-testid="lan-remote">{$localizedText.settings.lanRemoteOnly}</p>
        {:else if lanStatus === 'error'}
          <p class="text-xs text-[var(--red)]">{$localizedText.settings.lanLoadFailed}</p>
        {:else if lanStatus === 'ready'}
          <Checkbox id="lan-enabled" checked={lan.enabled} disabled={lanBusy} on:change={(event) => toggleLanAccess(event.target.checked)}>
            {$localizedText.settings.lanToggle}
          </Checkbox>
          {#if lan.enabled}
            {#if lan.urls.length}
              <div class="space-y-2" data-testid="lan-urls">
                <div class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.lanUrlsTitle}</div>
                {#each lan.urls as url (url)}
                  <div class="flex gap-2">
                    <input
                      type="text"
                      readonly
                      value={url}
                      aria-label={url}
                      on:focus={(event) => event.currentTarget.select()}
                      class={formFieldClass({ extraClass: 'font-mono text-xs' })}
                    />
                    <button
                      type="button"
                      on:click={() => copyLanUrl(url)}
                      class="shrink-0 rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                    >{$localizedText.settings.lanCopy}</button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.lanNoNetwork}</p>
            {/if}
            <p class="text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.lanSecurity}</p>
            <button
              type="button"
              disabled={lanBusy}
              data-testid="lan-renew"
              on:click={() => confirmingLanRenew = true}
              class="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >{$localizedText.settings.lanRenew}</button>
          {/if}
          {#if lan.restartRequired}
            <p role="status" class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.lanRestart}</p>
          {/if}
          {#if lanNotice}
            <p role="status" class="text-xs text-[var(--green)]">{lanNotice}</p>
          {/if}
          {#if lanError}
            <p role="alert" class="text-xs text-[var(--red)]">{lanError}</p>
          {/if}
        {/if}
        {#if confirmingLanRenew}
          <ConfirmModal
            danger={true}
            title={$localizedText.settings.lanRenewTitle}
            message={$localizedText.settings.lanRenewMessage}
            confirmLabel={$localizedText.settings.lanRenewAction}
            on:confirm={renewLanToken}
            on:cancel={() => confirmingLanRenew = false}
          />
        {/if}
      </section>

      <section class="space-y-5">
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.attachmentsTitle}</h2>
        {#if orphanStatus === 'loading'}
          <div class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.attachmentsLoading}</div>
        {:else if orphanStatus === 'error'}
          <div class="text-xs text-[var(--red)]">{$localizedText.settings.attachmentsError}</div>
        {:else if orphanLocked > 0}
          <div class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.attachmentsLocked}</div>
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
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.connectionsTitle}</h2>
        {#if connectionStatus === 'loading'}
          <div class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.connectionsLoading}</div>
        {:else if connectionStatus === 'error'}
          <div class="text-xs text-[var(--red)]">{$localizedText.settings.connectionsError}</div>
        {:else if connectionReport.broken.length + connectionReport.orphanCount + connectionReport.staleCount + connectionReport.conflictCopyCount === 0}
          <div class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.connectionsClean}</div>
        {:else}
          {#if connectionReport.broken.length > 0}
            <h3 class="text-[length:var(--text-whisper)] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{$localizedText.settings.brokenLinks}, {connectionReport.broken.length}</h3>
            <ul class="max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto border border-[var(--border-subtle)]" data-testid="broken-links">
              {#each connectionReport.broken as item (item.target)}
                <li class="flex items-center justify-between gap-3 px-3 py-2">
                  <span class="min-w-0 truncate text-xs text-[var(--text-primary)]">[[{item.target}]]</span>
                  <button
                    type="button"
                    class="min-w-0 shrink truncate text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
                    on:click={() => openNote(item.sources[0])}
                  >{$localizedText.settings.brokenLinkFrom.replace('{note}', noteNameOf(item.sources[0]))}</button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if connectionReport.orphanCount > 0}
            <h3 class="text-[length:var(--text-whisper)] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{$localizedText.settings.orphanNotes}, {connectionReport.orphanCount}</h3>
            <ul class="max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto border border-[var(--border-subtle)]" data-testid="orphan-notes">
              {#each connectionReport.orphans as item (item.path)}
                <li>
                  <button type="button" class="block w-full truncate px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]" on:click={() => openNote(item.path)}>{item.title}</button>
                </li>
              {/each}
            </ul>
            {#if connectionReport.orphanCount > connectionReport.orphans.length}
              <div class="text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.moreItems.replace('{count}', connectionReport.orphanCount - connectionReport.orphans.length)}</div>
            {/if}
          {/if}
          {#if connectionReport.staleCount > 0}
            <h3 class="text-[length:var(--text-whisper)] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{$localizedText.settings.staleNotes.replace('{days}', connectionReport.staleDays)}, {connectionReport.staleCount}</h3>
            <ul class="max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto border border-[var(--border-subtle)]" data-testid="stale-notes">
              {#each connectionReport.stale as item (item.path)}
                <li>
                  <button type="button" class="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-[var(--bg-secondary)]" on:click={() => openNote(item.path)}>
                    <span class="min-w-0 truncate text-[var(--text-primary)]">{item.title}</span>
                    <span class="shrink-0 text-[var(--text-tertiary)]">{$localizedText.settings.staleSince.replace('{date}', localeDate(new Date(item.lastActivity), $locale))}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if connectionReport.conflictCopyCount > 0}
            <h3 class="text-[length:var(--text-whisper)] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{$localizedText.settings.conflictCopies}, {connectionReport.conflictCopyCount}</h3>
            <ul class="max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto border border-[var(--border-subtle)]" data-testid="conflict-copies">
              {#each connectionReport.conflictCopies as item (item.path)}
                <li class="flex items-center justify-between gap-3 px-3 py-2">
                  <button type="button" class="min-w-0 truncate text-left text-xs text-[var(--text-primary)] hover:underline" on:click={() => openNote(item.path)}>{item.title}</button>
                  <span class="hidden min-w-0 truncate text-[length:var(--text-whisper)] text-[var(--text-tertiary)] sm:block">
                    {item.kind === 'duplicate'
                      ? $localizedText.settings.conflictSameText.replace('{original}', noteNameOf(item.original))
                      : $localizedText.settings.conflictCopyOf.replace('{original}', noteNameOf(item.original))}
                  </span>
                  <button
                    type="button"
                    data-testid="conflict-copy-trash"
                    class="shrink-0 text-xs text-[var(--text-secondary)] hover:text-[var(--red)]"
                    on:click={() => copyToTrash = item}
                  >{$localizedText.settings.conflictTrash}</button>
                </li>
              {/each}
            </ul>
            {#if connectionReport.conflictCopyCount > connectionReport.conflictCopies.length}
              <div class="text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.moreItems.replace('{count}', connectionReport.conflictCopyCount - connectionReport.conflictCopies.length)}</div>
            {/if}
            {#if copyError}
              <p role="alert" class="text-xs text-[var(--red)]">{copyError}</p>
            {/if}
          {/if}
        {/if}
        {#if copyToTrash}
          <ConfirmModal
            danger={true}
            title={$localizedText.settings.conflictTrashTitle}
            message={$localizedText.settings.conflictTrashMessage.replace('{original}', noteNameOf(copyToTrash.original))}
            confirmLabel={$localizedText.settings.conflictTrashAction}
            on:confirm={trashConflictCopy}
            on:cancel={() => copyToTrash = null}
          />
        {/if}
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
            <p class="pt-1 text-[var(--text-tertiary)]">{$localizedText.settings.tokenHelpNote}</p>
          </div>
        </details>

        <form on:submit|preventDefault={authenticate} class="mt-8 space-y-1.5">
          <label for="git-token" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.personalAccessToken}</label>
          <div class="flex gap-3">
            <input type="text" name="username" autocomplete="username" value="token" class="hidden" aria-hidden="true" tabindex="-1" />
            <input type="password" name="token" id="git-token" autocomplete="new-password" bind:value={settings.git_token} placeholder={$localizedText.settings.tokenPlaceholder} class="flex-1 {formFieldClass({ extraClass: 'focus:border-[var(--text-primary)]' })}" disabled={isAuthenticated} />
            {#if isAuthenticated}
              <button type="button" on:click={() => confirmingGitReset = true} class="text-xs uppercase tracking-widest font-bold shrink-0 text-[var(--red)]">{$localizedText.settings.reset}</button>
              {#if confirmingGitReset}
                <ConfirmModal
                  danger={true}
                  title={$localizedText.settings.resetGitTitle}
                  message={$localizedText.settings.resetGitMessage}
                  confirmLabel={$localizedText.settings.resetGitAction}
                  on:confirm={resetGitAuth}
                  on:cancel={() => confirmingGitReset = false}
                />
              {/if}
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
            <select id="git-repository" bind:value={settings.git_repo} on:change={onRepoChange} class={formFieldClass({ extraClass: 'appearance-none cursor-pointer select-chevron' })} disabled={!gitRepos.length}>
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
            <select id="git-branch" bind:value={settings.git_branch} on:change={saveSettings} class={formFieldClass({ extraClass: 'appearance-none cursor-pointer select-chevron' })}>
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
            <div class="text-xs motion-safe:animate-pulse text-[var(--text-secondary)]">{$localizedText.settings.checking}</div>
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
                {#if gitStatus.last_sync}<div class="text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.lastSync(gitStatus.last_sync)}</div>{/if}
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
            <li class="flex gap-3"><span class="text-[var(--text-tertiary)]">1</span><span><span class="font-bold text-[var(--text-primary)]">{$localizedText.settings.docsStepNew}</span> — {$localizedText.settings.docsStepNewHint}</span></li>
            <li class="flex gap-3"><span class="text-[var(--text-tertiary)]">2</span><span><span class="font-bold text-[var(--text-primary)]">{$localizedText.settings.docsStepImport}</span> — {$localizedText.settings.docsStepImportHint}</span></li>
            <li class="flex gap-3"><span class="text-[var(--text-tertiary)]">3</span><span><span class="font-bold text-[var(--text-primary)]">{$localizedText.settings.docsStepBackup}</span> — {$localizedText.settings.docsStepBackupHint}</span></li>
          </ol>
        </div>

        <div>
          <h3 class="mb-2 text-xs uppercase tracking-[0.16em] font-bold text-[var(--text-tertiary)]">{$localizedText.settings.docsKeyboard}</h3>
          <dl class="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            {#each [['Ctrl+K', $localizedText.settings.docsShortcutCommands], ['Ctrl+O', $localizedText.settings.docsShortcutOpen], ['Ctrl+B', $localizedText.settings.docsShortcutSidebar], ['Ctrl+Shift+F', $localizedText.settings.docsShortcutSearch], ['Ctrl+S', $localizedText.settings.docsShortcutSave]] as [keys, label]}
              <dt class="tabular-nums text-[var(--text-primary)]">{shortcutLabel(keys)}</dt>
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
    </details>


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
