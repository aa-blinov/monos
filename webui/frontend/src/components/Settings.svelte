<script>
  import { scrollBehavior } from '../lib/motion.js';
  import { ShieldAlert } from 'lucide-svelte';
  import { announceNotesPulled } from '../lib/note-refresh.js';
  import { get } from 'svelte/store';
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import ConflictResolver from './ConflictResolver.svelte';
  import AgentSettings from './AgentSettings.svelte';
  import { terminalBridge } from '../lib/terminal.js';
  import ConfirmModal from './ConfirmModal.svelte';
  import Checkbox from './Checkbox.svelte';
  import { DEFAULT_SYNC_MINUTES, normalizeSyncMinutes, setAutoSyncPolicy, uploadsChanges } from '../lib/git-sync.js';
  import { themes } from '../lib/themes.js';
  import { fontOptions, fontSizeOptions, editorFontSizeOptions } from '../lib/fonts.js';
  import { isSupportedLocale, locale, localeOptions, localizedText, uiText } from '../lib/strings.js';
  import { activeTheme, themeMode, fontFamily, fontSize, editorFontSize, editorState, settingsSection, tabsToSpaces } from '../stores.js';
  import ConnectStatus from './ConnectStatus.svelte';
  import SettingsNav from './SettingsNav.svelte';
  import { formFieldClass } from '../lib/form-field.js';
  import { exportNotesArchive, importNotesArchive } from '../lib/backup.js';
    import { printTreeToPdf } from '../lib/print.js';
  import { fetchClipperToken } from '../lib/clipper.js';
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
  import { qrPath } from '../lib/qr-code.js';
  import { relativeDay } from '../lib/date-format.js';
  import { conflictNotePath, refreshConflicts, revealConflicts } from '../lib/git-conflicts.js';

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
  // Filled from the token's GitHub login after Authorize; an invented owner would point at someone else's account.
  const DEFAULT_GIT_OWNER = '';
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
    git_auto_sync_minutes: DEFAULT_SYNC_MINUTES,
    git_auto_upload: true,
    git_auto_upload_quit: false,
    git_commit_message: uiText.settings.defaultCommitMessage,
    git_token: '',
    git_owner: DEFAULT_GIT_OWNER,
    git_repo: '',
    git_branch: 'master',
    device_name: '',
    locale: 'en',
  };

  let gitStatus = null;
  let gitRepos = [];
  let gitBranches = [];
  let gitConflicts = [];
  let conflictDetails = [];
  let showConflictResolver = false;
  $: fileConflictDetails = conflictDetails.filter((item) => !String(item.path).endsWith('.md'));
  let conflictIndex = 0;
  let isLoadingRepos = false;
  let isLoadingBranches = false;
  let isConnecting = false;
  // The connection to GitHub, as ConnectStatus shows it beside the button.
  let connectPhase = 'idle';
  let connectMessage = '';
  let connectSeconds = 0;
  let connectTicker = null;
  let connectedTarget = { repo: '', branch: '' };
  let isSettingUp = false;
  let isAuthenticated = false;
  let isSyncing = false;
  let isCheckingStatus = false;
  let isExporting = false;
  let isImporting = false;
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
  // The address the QR code shows: the one picked, or the first one.
  let qrUrl = '';
  $: shownQrUrl = lan.urls.includes(qrUrl) ? qrUrl : (lan.urls[0] || '');
  $: shownQr = shownQrUrl ? qrPath(shownQrUrl) : null;

  onMount(async () => {
    loadLanAccess();
    loadStorage();
  });

  // The two reports under "Advanced" read every note on disk; they run when that section is first opened,
  // not each time Settings is (on a big vault they were most of what Settings waited for).
  let advancedLoaded = false;
  function loadAdvancedReports(event) {
    if (advancedLoaded || !event.currentTarget.open) return;
    advancedLoaded = true;
    loadConnectionReport();
  }

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

    // No name chosen yet: the computer's own is filled in, to keep or change while connecting GitHub.
    if (!String(settings.device_name || '').trim()) {
      try {
        const response = await fetch('/api/device');
        if (response.ok) {
          const device = await response.json();
          settings.device_name = device.name || device.suggested || '';
        }
      } catch { /* the placeholder stays */ }
    }

    if (settings.git_token) {
      isAuthenticated = true;
      await fetchRepos();
      if (settings.git_repo) {
        await loadBranches();
      }
    }
  }

  // The automatic sync takes the new choices at once: its timer restarts with the new interval.
  async function saveAutoSync() {
    settings.git_auto_sync_minutes = normalizeSyncMinutes(settings.git_auto_sync_minutes);
    await saveSettings();
    setAutoSyncPolicy({ minutes: settings.git_auto_sync_minutes, upload: settings.git_auto_upload });
  }

  // The name goes through its own route: it also re-signs this device's next commits in git.
  async function saveDeviceName() {
    const name = String(settings.device_name || '').trim();
    if (!name) return;
    try {
      const response = await fetch('/api/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (response.ok) settings.device_name = (await response.json()).name;
    } catch (e) { console.error(e); }
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
    if (connectPhase !== 'connecting') connectPhase = 'idle';
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
    connectPhase = 'connecting';
    connectMessage = '';
    connectSeconds = 0;
    connectedTarget = { repo: repoFullName, branch: settings.git_branch };
    clearInterval(connectTicker);
    connectTicker = setInterval(() => { connectSeconds += 1; }, 1000);
    try {
      await saveSettings();
      const r = await fetch('/api/git/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: settings.git_token, owner: settings.git_owner, repo: repoFullName, branch: settings.git_branch, device_name: settings.device_name })
      });
      const answer = await r.json().catch(() => ({}));
      if (!r.ok) {
        // The reason is shown where the button is, not only in the box above the form, out of sight.
        connectPhase = 'error';
        // The common causes have a sentence of their own in this language; anything else keeps the server's words.
        connectMessage = $localizedText.settings.gitReasons[answer.reason] || answer.detail || $localizedText.settings.connectFailed;
        return;
      }
      await checkGitStatus();
      connectPhase = answer.conflicts ? 'conflicts' : 'done';
    } catch (e) {
      console.error(e);
      connectPhase = 'error';
      connectMessage = $localizedText.settings.connectFailed;
    } finally {
      clearInterval(connectTicker);
      isSettingUp = false;
    }
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
      if (r.ok) {
        await checkGitStatus();
        announceNotesPulled();
      }
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
        // The board and the tree mark conflicted notes from the same answer.
        void refreshConflicts();
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
      const left = conflictDetails.filter((item) => !String(item.path).endsWith('.md')).length;
      if (conflictIndex >= left) conflictIndex = Math.max(0, left - 1);
      void refreshConflicts();
      if (left === 0) {
        showConflictResolver = false;
        await checkGitStatus();
        // Resolved is half done until the other devices have it: send it now when sync uploads on its own.
        if (uploadsChanges() && gitStatus?.status !== 'conflict') await handleSync();
      }
    } catch (e) { console.error(e); }
  }

  // Opened from the first-run screen at a section: it is scrolled into view and marked for a moment.
  function revealSection(node, id) {
    if (get(settingsSection) !== id) return;
    settingsSection.set('');
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
      node.classList.add('settings-flash');
      setTimeout(() => node.classList.remove('settings-flash'), 1600);
    });
  }

  // Reached from the sidebar's "conflict in N files" link: the list is what the person came for.
  function revealWhenAsked(node) {
    if (!get(revealConflicts)) return;
    revealConflicts.set(false);
    requestAnimationFrame(() => node.scrollIntoView({ block: 'center', behavior: scrollBehavior() }));
  }

  function openConflictResolver() {
    conflictIndex = 0;
    showConflictResolver = true;
  }

  function initSettingsPage() {
    loadSettings();
    checkGitStatus();
  }

  // The parts of the page, for the navigation: the one in view is marked as the page scrolls.
  let scroller;
  let activeGroup = 'settings-appearance';
  $: navItems = [
    { id: 'settings-appearance', label: $localizedText.settings.appearance },
    { id: 'settings-data', label: $localizedText.settings.navData },
    { id: 'settings-sync', label: $localizedText.settings.navSync },
    { id: 'settings-devices', label: $localizedText.settings.navDevices },
    ...(terminalBridge ? [{ id: 'settings-agent', label: $localizedText.agent.title }] : []),
    { id: 'settings-more', label: $localizedText.settings.advanced },
  ];

  // A part chosen in the list stays marked while the page scrolls to it: a short part near the end cannot reach the
  // top, and the scroll would otherwise mark its neighbour.
  let navLockUntil = 0;
  function updateActive() {
    if (!scroller || Date.now() < navLockUntil) return;
    const line = scroller.getBoundingClientRect().top + 140;
    let current = navItems[0]?.id || '';
    for (const item of navItems) {
      const element = document.getElementById(item.id);
      if (element && element.getBoundingClientRect().top <= line) current = item.id;
    }
    // At the very end of the page the last part is the one in view, even when it is too short to reach the line.
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) current = navItems[navItems.length - 1]?.id || current;
    activeGroup = current;
  }

  function goToGroup(event) {
    const element = document.getElementById(event.detail);
    if (!element) return;
    if (element.tagName === 'DETAILS') element.open = true;
    navLockUntil = Date.now() + 1000;
    element.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    activeGroup = event.detail;
  }

  onMount(initSettingsPage);
  onDestroy(() => clearInterval(connectTicker));
</script>

<div class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8" bind:this={scroller} on:scroll={updateActive}>
  <div class="mx-auto w-full max-w-6xl">

    <div class="mb-7">
      <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.settings.title}</h1>
      <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
        {$localizedText.settings.hint}
      </p>
    </div>

    <div class="lg:grid lg:grid-cols-[9.5rem_minmax(0,1fr)] lg:gap-10">
    <SettingsNav items={navItems} active={activeGroup} on:go={goToGroup} />

    <div class="min-w-0 space-y-8">

    <section class="space-y-5 scroll-mt-16 lg:scroll-mt-6" id="settings-appearance" data-testid="appearance-section">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.appearance}</h2>
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
      <div>
        <div class="mb-2 block text-xs text-[var(--text-secondary)]">{$localizedText.settings.themeMode}</div>
        <div class="grid grid-cols-3 gap-2 rounded-ui border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_25%,transparent)] p-1" role="group" aria-label={$localizedText.settings.themeMode}>
          {#each themeModeOptions as option}
            <button
              type="button"
              aria-pressed={$themeMode === option.value}
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
      <!-- Each theme shows itself: its light and dark page with text and an accent, small enough for one row. -->
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {#each Object.entries(themes) as [key, t]}
          <button
            type="button"
            aria-pressed={$activeTheme === key}
            on:click={() => { $activeTheme = key; saveSettings(); }}
            class="rounded-ui border p-1.5 text-left transition-colors {$activeTheme === key ? 'border-[var(--text-primary)]' : 'border-[var(--border-subtle)] hover:border-[var(--text-secondary)]'}"
          >
            <span class="flex h-12 overflow-hidden rounded-ui" aria-hidden="true">
              {#each [t.light, t.dark] as palette}
                <span class="flex flex-1 items-end justify-between gap-1 px-2 pb-1.5" style="background: {palette['--bg-primary']}; color: {palette['--text-primary']};">
                  <span class="text-sm font-bold leading-none">Aa</span>
                  <span class="mb-0.5 h-1 w-3 rounded-ui" style="background: {palette['--yellow'] || palette['--orange'] || palette['--text-secondary']};"></span>
                </span>
              {/each}
            </span>
            <span class="mt-1.5 block truncate px-0.5 text-xs {$activeTheme === key ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}">{t.name}</span>
          </button>
        {/each}
      </div>
      </div>
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
              <option value={f.name}>{f.category === 'system' ? $localizedText.settings.fontSystem : `${f.name} (${$localizedText.optionLabels.fontCategory?.[f.category] || f.category})`}</option>
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
      <div class="min-w-0">
        <label for="tabs-to-spaces" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.tabsToSpaces}</label>
        <select
          id="tabs-to-spaces"
          bind:value={$tabsToSpaces}
          class={formFieldClass({ extraClass: 'appearance-none cursor-pointer select-chevron' })}
        >
          <option value="off">{$localizedText.settings.tabsOff}</option>
          <option value="2">{$localizedText.settings.tabs2}</option>
          <option value="4">{$localizedText.settings.tabs4}</option>
        </select>
        <p class="mt-1.5 text-xs text-[var(--text-tertiary)]">{$localizedText.settings.tabsToSpacesHint}</p>
      </div>
    </section>

    <section class="space-y-5 scroll-mt-16 rounded-ui border-t border-[var(--border-subtle)] pt-5 lg:scroll-mt-6" id="settings-data" data-testid="storage-section" use:revealSection={'storage'}>
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.storageTitle}</h2>
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.storageHint}</p>
      {#if storageStatus === 'remote'}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.storageRemoteOnly}</p>
      {:else if storage}
        <code class="rounded-ui block break-all border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_35%,transparent)] px-4 py-2.5 text-xs text-[var(--text-primary)]" data-testid="storage-folder">{storage.folder}</code>
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
            class="rounded-ui border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >{$localizedText.settings.storageChoose}</button>
          {#if storage.target !== storage.defaultFolder}
            <button
              type="button"
              disabled={storageBusy}
              data-testid="storage-reset"
              on:click={useDefaultStorage}
              class="rounded-ui border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >{$localizedText.settings.storageReset}</button>
          {/if}
        </div>
      {/if}
      {#if storageError}
        <p role="alert" class="text-xs text-[var(--red)]">{storageError}</p>
      {/if}
    </section>

    <section class="space-y-4 border-t border-[var(--border-subtle)] pt-5 pb-2">
      <div>
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.backup}</h2>
        <p class="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">{$localizedText.settings.backupHint}</p>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <div class="min-w-0">
          <div class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.settings.exportTitle}</div>
          <div class="flex flex-wrap gap-x-6 gap-y-2">
          <button
            type="button"
            on:click={printAllNotes}
            disabled={isExporting || isImporting}
            class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition disabled:opacity-30"
          >
            {$localizedText.settings.printAllNotes}
          </button>
          <button
            type="button"
            on:click={exportNotes}
            disabled={isExporting}
            class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition disabled:opacity-30"
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
              class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition disabled:opacity-30"
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

    <!-- GitHub Connection -->
    <section class="space-y-5 scroll-mt-16 rounded-ui border-t border-[var(--border-subtle)] pt-5 lg:scroll-mt-6" id="settings-sync" data-testid="sync-section" use:revealSection={'sync'}>
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.githubConnection}</h2>

      <!-- Help -->
      <details open={!isAuthenticated} class="text-xs text-[var(--text-secondary)] group">
        <summary class="min-h-6 cursor-pointer py-1 hover:text-[var(--text-primary)] transition-colors max-sm:min-h-11 max-sm:py-3">{$localizedText.settings.tokenHelp}</summary>
        <div class="mt-3 space-y-2 rounded-ui border border-[var(--border-subtle)] p-3 leading-relaxed">
          <p>{$localizedText.settings.tokenHelpSteps[0]} <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" class="underline hover:opacity-60">{$localizedText.settings.tokenHelpUrl}</a></p>
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
        <div class="rounded-ui border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3">
          <p class="text-sm font-bold text-[var(--red)]">{$localizedText.settings.publicRepoTitle}</p>
          <p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{$localizedText.settings.publicRepoHint}</p>
        </div>
      {/if}

      {#if repoSafety && repoSafety.canPush === false}
        <div class="rounded-ui border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3" data-testid="read-only-token">
          <p class="text-sm font-bold text-[var(--red)]">{$localizedText.settings.readOnlyTokenTitle}</p>
          <p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{$localizedText.settings.readOnlyTokenHint}</p>
        </div>
      {/if}

      {#if scopeWarnings.length}
        <div class="rounded-ui border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_35%,transparent)] px-4 py-3">
          <p class="text-xs font-bold text-[var(--text-primary)]">{$localizedText.settings.tokenScopeTitle}</p>
          <ul class="mt-1.5 space-y-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {#each scopeWarnings as warning}
              <li><code class="text-[var(--text-primary)]">{warning.scope}</code>: {warning.why}</li>
            {/each}
          </ul>
          <p class="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.settings.tokenScopeHint}</p>
        </div>
      {/if}

      {#if gitError}
        <div class="text-xs rounded-ui bg-[var(--bg-secondary)] px-3 py-2 text-[var(--red)]">{gitError}</div>
      {/if}

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="git-owner" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.owner}</label>
          <input type="text" id="git-owner" bind:value={settings.git_owner} placeholder={$localizedText.settings.ownerPlaceholder} class={formFieldClass({ extraClass: isAuthenticated ? 'opacity-50' : '' })} disabled={isAuthenticated} />
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
          <label for="device-name" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.deviceName}</label>
          <input id="device-name" type="text" maxlength="40" bind:value={settings.device_name} on:change={saveDeviceName} placeholder={$localizedText.settings.devicePlaceholder} class={formFieldClass()} />
          <p class="mt-1.5 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.deviceNameHint}</p>
        </div>
      </div>

      <!-- Git's word for a version line: most people never change it, so it waits one click away. -->
      <details class="text-xs text-[var(--text-secondary)]" data-testid="git-advanced">
        <summary class="min-h-6 cursor-pointer py-1 hover:text-[var(--text-primary)] transition-colors max-sm:min-h-11 max-sm:py-3">{$localizedText.settings.gitAdvanced}</summary>
        <div class="mt-3 max-w-sm">
          <label for="git-branch" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.branch}</label>
          <select id="git-branch" bind:value={settings.git_branch} on:change={saveSettings} class={formFieldClass({ extraClass: 'appearance-none cursor-pointer select-chevron' })}>
            {#if isLoadingBranches}
              <option>{$localizedText.settings.loading}</option>
            {:else if gitBranches.length}
              {#each gitBranches as b}
                <option value={b}>{b}</option>
              {/each}
            {:else}
              <option value="master">master</option>
            {/if}
          </select>
          <p class="mt-1.5 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.branchHint}</p>
        </div>
      </details>

      <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <ConnectStatus
          phase={connectPhase}
          repo={connectedTarget.repo}
          branch={connectedTarget.branch}
          seconds={connectSeconds}
          message={connectMessage}
          connectedRepo={gitStatus?.initialized ? gitStatus.repo : ''}
          connectedBranch={gitStatus?.branch || ''}
        />
        <button
          type="button"
          on:click={setupGitRepo}
          disabled={isSettingUp || !settings.git_token || !getSelectedRepoFullName()}
          class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition disabled:opacity-30"
        >
          {isSettingUp ? $localizedText.settings.connecting : $localizedText.settings.connectRepository}
        </button>
      </div>
      <p class="text-xs leading-relaxed text-[var(--text-tertiary)]" data-testid="upload-notice">
        {settings.git_auto_upload ? $localizedText.settings.autoUploadNotice(settings.git_auto_sync_minutes) : $localizedText.settings.manualUploadNotice}
      </p>
    </section>

    <!-- Sync Settings -->
    <section class="space-y-5 border-t border-[var(--border-subtle)] pt-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.syncSettings}</h2>

      <div class="grid grid-cols-2 gap-6">
        <div>
          <label for="auto-sync-minutes" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.autoSyncEvery}</label>
          <div class="flex items-center gap-3"><input id="auto-sync-minutes" type="number" min="1" max="1440" bind:value={settings.git_auto_sync_minutes} on:change={saveAutoSync} class={formFieldClass({ extraClass: 'focus:border-[var(--text-primary)]' })} /><span class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.minutesUnit}</span></div>
          <p class="text-[length:var(--text-whisper)] text-[var(--text-secondary)] mt-1">{$localizedText.settings.autoSyncHint}</p>
        </div>
      </div>

      <details class="text-xs text-[var(--text-secondary)]" data-testid="commit-advanced">
        <summary class="min-h-6 cursor-pointer py-1 hover:text-[var(--text-primary)] transition-colors max-sm:min-h-11 max-sm:py-3">{$localizedText.settings.commitAdvanced}</summary>
        <div class="mt-3 max-w-sm">
          <label for="git-commit-message" class="block text-xs text-[var(--text-secondary)] mb-1.5">{$localizedText.settings.commitMessage}</label>
          <input id="git-commit-message" type="text" bind:value={settings.git_commit_message} on:change={saveSettings} class={formFieldClass()} />
          <p class="mt-1.5 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.commitMessageHint}</p>
        </div>
      </details>

      <div class="space-y-3">
        <Checkbox id="git-auto-upload" bind:checked={settings.git_auto_upload} on:change={saveAutoSync}>
          {$localizedText.settings.autoUpload}
        </Checkbox>
        <Checkbox id="git-auto-upload-quit" bind:checked={settings.git_auto_upload_quit} on:change={saveAutoSync}>
          {$localizedText.settings.autoUploadOnQuit}
        </Checkbox>
      </div>
    </section>

    {#if gitStatus?.initialized}
    <!-- Status & Sync -->
    <section class="space-y-4 border-t border-[var(--border-subtle)] pt-5">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.statusAndSync}</h2>

      <div class="border rounded-ui border border-[var(--border-subtle)] p-5">
        {#if isCheckingStatus}
          <div class="text-xs motion-safe:animate-pulse text-[var(--text-secondary)]">{$localizedText.settings.checking}</div>
        {:else if gitStatus?.initialized}
          <div class="flex items-center justify-between">
            <div class="space-y-1.5 text-sm">
              <div class="flex items-center gap-2.5">
                <span class="w-2 h-2 rounded-full" class:bg-[var(--green)]={gitStatus.status === 'clean'} class:bg-[var(--yellow)]={gitStatus.status === 'dirty' || gitStatus.ahead > 0} class:bg-[var(--red)]={gitStatus.status === 'conflict' || gitStatus.behind > 0}></span>
                <span class="font-medium">{gitStatus.current_branch}</span>
                <span class="text-[var(--text-secondary)]">{$localizedText.settings[gitStatus.status] || gitStatus.status}</span>
              </div>
              {#if gitStatus.ahead > 0}<div class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.ahead(gitStatus.ahead)}</div>{/if}
              {#if gitStatus.behind > 0}<div class="text-xs text-[var(--text-secondary)]">{$localizedText.settings.behind(gitStatus.behind)}</div>{/if}
              {#if gitStatus.status === 'conflict'}<div class="text-xs text-[var(--red)]">{$localizedText.settings.conflictStatus}</div>{/if}
              {#if gitStatus.last_sync}<div class="text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.settings.lastSync(relativeDay(gitStatus.last_sync, $locale, { today: $localizedText.app.board.today, yesterday: $localizedText.app.board.yesterday }))}</div>{/if}
            </div>
            <button on:click={handleSync} disabled={isSyncing || $editorState.saving || $editorState.dirty} class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition disabled:opacity-30">
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
        <button on:click={checkGitStatus} class="min-h-6 uppercase tracking-widest transition hover:opacity-60 max-sm:min-h-11">{$localizedText.settings.refreshStatus}</button>
        {#if gitConflicts.length > 0}
          <button on:click={loadConflicts} class="uppercase tracking-widest hover:opacity-60 transition">{$localizedText.settings.viewConflicts}</button>
        {/if}
      </div>
    </section>

    {/if}

    <section class="space-y-5 scroll-mt-16 border-t border-[var(--border-subtle)] pt-5 lg:scroll-mt-6" id="settings-devices" data-testid="lan-section">
      <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.lanTitle}</h2>
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.lanHint}</p>
      <!-- Said before the switch, at reading size: the risk is part of the decision, not a footnote after it. -->
      <div role="note" data-testid="lan-security" class="flex max-w-2xl gap-3 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
        <ShieldAlert size="20" strokeWidth="1.7" class="mt-0.5 shrink-0 text-[var(--text-primary)]" aria-hidden="true" />
        <p class="text-sm leading-relaxed text-[var(--text-primary)]">{$localizedText.settings.lanSecurity}</p>
      </div>
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
                    class="inline-flex min-h-9 shrink-0 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition"
                  >{$localizedText.settings.lanCopy}</button>
                  {#if lan.urls.length > 1}
                    <button
                      type="button"
                      aria-pressed={shownQrUrl === url}
                      on:click={() => qrUrl = url}
                      class="inline-flex min-h-9 shrink-0 items-center text-xs uppercase tracking-widest transition hover:opacity-60 {shownQrUrl === url ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
                    >{$localizedText.settings.lanShowQr}</button>
                  {/if}
                </div>
              {/each}
              {#if shownQrUrl}
                <figure class="flex flex-col items-start gap-3 pt-2 sm:flex-row sm:items-center sm:gap-5">
                  <!-- Black on white whatever the theme: some phone cameras do not read an inverted code. -->
                  <svg
                    viewBox="0 0 {shownQr.size} {shownQr.size}"
                    class="h-40 w-40 shrink-0 rounded-ui bg-white"
                    role="img"
                    aria-label={$localizedText.settings.lanQrLabel(shownQrUrl)}
                    shape-rendering="crispEdges"
                    data-testid="lan-qr"
                  ><path d={shownQr.path} fill="#000" /></svg>
                  <figcaption class="max-w-xs text-xs leading-relaxed text-[var(--text-secondary)]">{$localizedText.settings.lanQrHint}</figcaption>
                </figure>
              {/if}
            </div>
          {:else}
            <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.lanNoNetwork}</p>
          {/if}
          <button
            type="button"
            disabled={lanBusy}
            data-testid="lan-renew"
            on:click={() => confirmingLanRenew = true}
            class="rounded-ui border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
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

    <!-- Conflicts -->
    {#if gitConflicts.length > 0}
      <section class="space-y-4 pt-2" use:revealWhenAsked>
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.conflicts(gitConflicts.length)}</h2>
        <div class="border rounded-ui border border-[var(--border-subtle)] p-4 space-y-2 max-h-48 overflow-y-auto">
          <!-- A note is resolved in the note, part by part; only other files take a whole side here. -->
          {#each gitConflicts as conflict}
            <div class="flex items-center justify-between gap-4 py-1 text-sm border-b border-[var(--border-subtle)] last:border-0">
              <span class="truncate font-mono text-xs">{getConflictLabel(conflict)}</span>
              {#if String(conflict).endsWith('.md')}
                <button
                  type="button"
                  data-testid="settings-open-conflict"
                  on:click={() => dispatch('navigate', { path: conflictNotePath(conflict), name: String(conflict).split('/').pop(), isDir: false })}
                  class="shrink-0 text-xs uppercase tracking-widest font-bold hover:opacity-60 transition"
                >{$localizedText.settings.openConflictNote}</button>
              {/if}
            </div>
          {/each}
        </div>
        {#if fileConflictDetails.length > 0}
          <button on:click={openConflictResolver} class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition disabled:opacity-30">
            {$localizedText.settings.resolveFileConflicts}
          </button>
        {/if}
      </section>
    {/if}

    <!-- The agent is for people who run one in the terminal: after what everyone needs (look, data, sync, devices). -->
    {#if terminalBridge}
      <div id="settings-agent" class="scroll-mt-16 border-t border-[var(--border-subtle)] pt-5 lg:scroll-mt-6">
        <AgentSettings />
      </div>
    {/if}

    <!-- The guide lives in the Help; Settings only points to it. -->
    <section class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--border-subtle)] pt-5" data-testid="settings-help-link">
      <div class="min-w-0">
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.helpTitle}</h2>
        <p class="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.settings.helpText}</p>
      </div>
      <button type="button" data-testid="settings-open-help" on:click={() => dispatch('openHelp')} class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition">{$localizedText.settings.helpOpen}</button>
    </section>

    <details class="group scroll-mt-16 space-y-8 border-t border-[var(--border-subtle)] pt-6 lg:scroll-mt-6" id="settings-more" data-testid="advanced-settings" on:toggle={loadAdvancedReports}>
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
            class="rounded-ui border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >{publishBusy ? $localizedText.settings.publishing : $localizedText.settings.publishButton}</button>
        </form>
        {#if publishStatus}
          <p role="status" class="text-xs text-[var(--green)] break-all">{publishStatus}</p>
        {/if}
        {#if publishError}
          <p role="alert" class="text-xs text-[var(--red)]">{publishError}</p>
        {/if}
      </section>


      <section class="space-y-3">
        <h2 class="text-xs uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)]">{$localizedText.settings.attachmentsTitle}</h2>
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.settings.attachmentsMoved}</p>
        <button type="button" data-testid="settings-open-attachments" on:click={() => dispatch('openAttachments')} class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition">{$localizedText.settings.attachmentsOpen}</button>
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
            <ul class="rounded-ui max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto border border-[var(--border-subtle)]" data-testid="broken-links">
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
            <ul class="rounded-ui max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto border border-[var(--border-subtle)]" data-testid="orphan-notes">
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
            <ul class="rounded-ui max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto border border-[var(--border-subtle)]" data-testid="stale-notes">
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
            <ul class="rounded-ui max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto border border-[var(--border-subtle)]" data-testid="conflict-copies">
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
            class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold hover:opacity-60 transition disabled:opacity-30"
          >
            {$localizedText.settings.clipperShowToken}
          </button>
          {#if showClipperToken}
            <div class="min-w-0 flex-1 space-y-1">
              <div class="text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{$localizedText.settings.clipperEndpoint}</div>
              <code class="rounded-ui block break-all border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_35%,transparent)] px-4 py-2.5 text-xs text-[var(--text-primary)]">{window.location.origin}</code>
              <div class="text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{$localizedText.settings.clipperTokenLabel}</div>
              <code class="rounded-ui block break-all border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_35%,transparent)] px-4 py-2.5 text-xs text-[var(--text-primary)]">{clipperToken}</code>
            </div>
          {/if}
        </div>
        {#if clipperError}
          <div class="text-xs text-[var(--red)]">{clipperError}</div>
        {/if}
      </section>



    </details>


    <footer class="border-t border-[var(--border-subtle)] pt-4 pb-1 text-left text-[length:var(--text-whisper)] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
      <span class="text-[var(--text-tertiary)]">{$localizedText.settings.version} {appVersion}</span>
    </footer>

    </div>
    </div>

  </div>
</div>

{#if showConflictResolver && fileConflictDetails.length > 0}
  <ConflictResolver
    conflicts={fileConflictDetails}
    currentIndex={conflictIndex}
    on:resolve={handleConflictResolve}
    on:done={() => { showConflictResolver = false; }}
  />
{/if}

<style>
  :global(.settings-flash) { background: color-mix(in srgb, var(--yellow) 14%, transparent); transition: background-color 0.6s ease; }
</style>
