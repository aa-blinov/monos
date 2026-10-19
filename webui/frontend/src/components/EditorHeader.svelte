<script>
  import { noteSyncStatus } from '../lib/git-conflicts.js';
  import { displayFolderName, locale, localizedText } from '../lib/strings.js';
  import { interfaceDateTime } from '../lib/date-format.js';
  import { ArrowLeft, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { sidebarOpen, toggleSidebar } from '../lib/sidebar.js';

  export let editedTitle = '';
  export let currentFile = null;
  export let fileInfo = null;
  export let wordCharStats = '';
  /** { connected, lastSync } of the repository; the line shows when it last synced and whether this note waits. */
  export let syncInfo = null;
  export let taskProgress = null;
  export let outlineOpen = false;
  export let onToggleOutline = () => {};
  /** False while the note is in a sync conflict: there is no outline to show then. */
  export let outlineAvailable = true;
  /** The note is in a sync conflict: renaming it would move a file git is still merging. */
  export let titleLocked = false;
  export let onBack = () => {};
  /** The text below is scrolled: the title rides in the top row and the rest folds away. */
  export let compact = false;
  export let focusMode = false;
  export let onExitFocus = () => {};
  let titleFocused = false;
  $: folded = compact && !titleFocused;
  export let onTitleInput = () => {};
  export let onCommitTitle = () => {};
  export let onFinishTitle = () => {};

  function titleKeydown(event) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    event.currentTarget.blur();
    onFinishTitle();
  }

  $: sidebarToggleLabel = $sidebarOpen ? $localizedText.header.closeSidebar : $localizedText.header.openSidebar;
  const navButtonClass = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] lg:h-10 lg:w-10';

  $: syncStatus = noteSyncStatus(syncInfo, currentFile?.path);
  const formatDateTime = (value) => interfaceDateTime(value, $locale);

  $: breadcrumbParts = currentFile?.path
    ? currentFile.path
      .replace(/^notes\//, '')
      .split('/')
      .slice(0, -1)
      .map((name, index, parts) => ({
        name: index === 0 ? displayFolderName(name, $localizedText) : name,
        path: `notes/${parts.slice(0, index + 1).join('/')}`,
      }))
    : [];
</script>

<!-- The note's own header is the only bar above it: back, the sidebar and the trash share a row with the
     folder path, so the text starts high and the note's colour covers one block, not two. -->
<header class="relative isolate overflow-hidden px-4 pb-2 lg:px-12 lg:pb-3 space-y-1 lg:space-y-2">
  <!-- The note's colour, set by the editor: the same tint and glow its card has on the board. `!mt-0`: the
       header's vertical spacing must not push these layers down from its top edge. -->
  <span class="pointer-events-none absolute inset-0 -z-10 !mt-0 bg-[var(--note-header-tint,transparent)]" aria-hidden="true"></span>
  <!-- A radial gradient rather than a blurred circle: in a short, wide header a blurred circle is cut by the
       edges and shows a band; the gradient fades out on its own. -->
  <span class="pointer-events-none absolute inset-0 -z-10 !mt-0" style="background: radial-gradient(ellipse 45% 160% at 100% 0%, var(--note-header-glow, transparent), transparent 70%);" aria-hidden="true"></span>
  <!-- The bar row matches the app header: 56px tall, its icons 16px from the edges, wherever the text column sits. -->
  <div class="!mt-0 flex min-h-14 min-w-0 items-center gap-1 lg:-mx-8">
    <TooltipIconButton on:click={onBack} class={navButtonClass} label={$localizedText.header.back} tooltip={$localizedText.header.back} tooltipAlign="start">
      <ArrowLeft class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
    <TooltipIconButton on:click={toggleSidebar} class={navButtonClass} label={sidebarToggleLabel} tooltip={sidebarToggleLabel} tooltipAlign="start">
      {#if $sidebarOpen}
        <PanelLeftClose class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
      {:else}
        <PanelLeftOpen class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
      {/if}
    </TooltipIconButton>
    {#if folded}
      <p class="ml-2 min-w-0 flex-1 truncate font-serif text-sm font-medium tracking-tight text-[var(--text-primary)]" data-testid="header-compact-title">{editedTitle}</p>
    {:else}
      <div class="ml-2 flex min-w-0 flex-1 items-center gap-1 text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
        {#each breadcrumbParts as part, index}
          {#if index > 0}
            <span aria-hidden="true">/</span>
          {/if}
          <span class="max-w-[12rem] truncate">{part.name}</span>
        {/each}
      </div>
    {/if}
    {#if focusMode}
      <button type="button" data-testid="exit-focus" on:click={onExitFocus} class="shrink-0 rounded-ui px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)]">{$localizedText.editor.focusOff} <span class="text-[var(--text-tertiary)]">Esc</span></button>
    {/if}
    <!-- The right column is opened and closed from here: the note's actions sit at one end of one row,
         and the line under the title stays a sentence. -->
    {#if outlineAvailable && !focusMode}
      <TooltipIconButton
        on:click={onToggleOutline}
        class={navButtonClass}
        label={$localizedText.editor.outline}
        tooltip={$localizedText.editor.outline}
        tooltipAlign="end"
        data-testid="outline-toggle"
        aria-expanded={outlineOpen}
      >
        {#if outlineOpen}
          <PanelRightClose class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
        {:else}
          <PanelRightOpen class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
        {/if}
      </TooltipIconButton>
    {/if}
  </div>
  <!-- The header does not follow the text width: it is a column of fixed width centred on the same axis as the text below (the Structure column's room is left out). -->
  <div class="ml-[max(0px,calc((100%-var(--outline-inset,0px)-48rem)/2))] max-w-[min(48rem,calc(100%-var(--outline-inset,0px)))] flex w-full flex-col lg:flex-row lg:items-start justify-between gap-4 lg:gap-12" class:hidden={folded}>
    <div class="flex-1 min-w-0">
      <!-- The note's title is the page's heading; the field below is how it is edited. -->
      <h1 class="sr-only">{editedTitle}</h1>
      <input
        type="text"
        bind:value={editedTitle}
        on:input={onTitleInput}
        on:focus={() => { titleFocused = true; }}
        on:blur={() => { titleFocused = false; onCommitTitle(); }}
        on:keydown={titleKeydown}
        readonly={titleLocked}
        title={titleLocked ? $localizedText.editor.conflictPropertiesLocked : undefined}
        aria-label={$localizedText.editorHeader.noteTitle}
        placeholder={$localizedText.editorHeader.noteTitle}
        class="text-lg lg:text-2xl leading-tight font-serif font-medium tracking-tight bg-transparent outline-none w-full py-1.5 !border-none"
      />
      {#if fileInfo}
        <!-- One sentence: the parts follow each other separated by commas. As plain text the line wraps
             like a sentence, so a narrow column never scatters the parts over several rows. -->
        <div class="mt-1.5 min-w-0 text-[length:var(--text-whisper)] lg:text-[length:var(--text-whisper-lg)]" data-testid="note-meta">
          <!-- The date comes first and is always there; when the note was made is in the tooltip. -->
          <span class="meta-part inline text-[var(--text-tertiary)]" title="{$localizedText.editorHeader.created} {formatDateTime(fileInfo.created)}">
            {$localizedText.editorHeader.modified} {formatDateTime(fileInfo.modified)}
          </span>
          {#if syncStatus !== 'none'}
            <!-- The place of sync in the note: beside its own date, only when a repository is connected. -->
            <span
              class="meta-part inline tabular-nums {syncStatus === 'synced' ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}"
              data-testid="note-sync"
              data-state={syncStatus}
              title={syncStatus === 'synced' ? undefined : $localizedText.editorHeader[`sync${syncStatus[0].toUpperCase()}${syncStatus.slice(1)}Hint`]}
            >
              {#if syncStatus === 'synced'}{syncInfo.lastSync ? $localizedText.editorHeader.syncedAt(formatDateTime(syncInfo.lastSync)) : $localizedText.editorHeader.synced}{:else}{$localizedText.editorHeader[`sync${syncStatus[0].toUpperCase()}${syncStatus.slice(1)}`]}{/if}
            </span>
          {/if}
          {#if wordCharStats}
            <span class="meta-part inline tabular-nums text-[var(--text-tertiary)]">{wordCharStats}</span>
          {/if}
          {#if taskProgress && taskProgress.total > 0}
            <span
              class="meta-part inline-flex items-center gap-2 text-[var(--text-tertiary)]"
              data-testid="task-progress"
              title={taskProgress.isComplete
                ? $localizedText.editorHeader.taskProgress.complete
                : $localizedText.editorHeader.taskProgress.percent(taskProgress.percent)}
            >
              <span
                class="h-1 w-14 overflow-hidden rounded-ui bg-[var(--bg-secondary)]"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={taskProgress.percent}
              >
                <span
                  class="block h-full rounded-ui transition-[width] duration-300"
                  class:bg-[var(--green)]={taskProgress.isComplete}
                  class:bg-[var(--text-tertiary)]={!taskProgress.isComplete}
                  style={`width: ${taskProgress.percent}%`}
                />
              </span>
              <span class="tabular-nums">
                {$localizedText.editorHeader.taskProgress.label(taskProgress.done, taskProgress.total)}
              </span>
            </span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  /* The meta line is one sentence: the parts follow each other separated by commas. The date is always
     there and always first, so every part after it ends with a comma and the last one does not. */
  .meta-part::after {
    content: ',';
  }
  .meta-part:last-of-type::after {
    content: none;
  }
</style>
