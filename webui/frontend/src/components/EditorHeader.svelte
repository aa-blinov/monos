<script>
  import { displayFolderName, locale, localizedText } from '../lib/strings.js';
  import { openPrintView } from '../lib/print.js';
  import { ArrowLeft, History, PanelLeftClose, PanelLeftOpen, Trash2 } from 'lucide-svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { sidebarOpen, toggleSidebar } from '../lib/sidebar.js';

  export let editedTitle = '';
  export let currentFile = null;
  export let fileInfo = null;
  export let wordCharStats = '';
  export let taskProgress = null;
  export let historyAvailable = false;
  export let onOpenHistory = () => {};
  export let outlineOpen = false;
  export let onToggleOutline = () => {};
  export let onBack = () => {};
  /** The text below is scrolled: the title rides in the top row and the rest folds away. */
  export let compact = false;
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
  export let onDelete = () => {};

  $: sidebarToggleLabel = $sidebarOpen ? $localizedText.header.closeSidebar : $localizedText.header.openSidebar;
  const navButtonClass = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] lg:h-9 lg:w-9';

  const dateLocale = (current = 'en') => (current === 'ru' ? 'ru-RU' : 'en-US');
  const formatDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(dateLocale($locale), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  function browserPrint() {
    if (!currentFile?.path) return;
    openPrintView({ scope: 'note', path: currentFile.path });
  }

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
<header class="relative isolate overflow-hidden px-2 pb-2 pt-1 lg:px-12 lg:pb-3 lg:pt-3 space-y-1 lg:space-y-2">
  <!-- The note's colour, set by the editor: the same tint and glow its card has on the board. `!mt-0`: the
       header's vertical spacing must not push these layers down from its top edge. -->
  <span class="pointer-events-none absolute inset-0 -z-10 !mt-0 bg-[var(--note-header-tint,transparent)]" aria-hidden="true"></span>
  <!-- A radial gradient rather than a blurred circle: in a short, wide header a blurred circle is cut by the
       edges and shows a band; the gradient fades out on its own. -->
  <span class="pointer-events-none absolute inset-0 -z-10 !mt-0" style="background: radial-gradient(ellipse 45% 160% at 100% 0%, var(--note-header-glow, transparent), transparent 70%);" aria-hidden="true"></span>
  <div class="flex min-w-0 items-center gap-1 lg:-ml-10">
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
            <span class="opacity-40">/</span>
          {/if}
          <span class="max-w-[12rem] truncate">{part.name}</span>
        {/each}
      </div>
    {/if}
    <!-- Quiet until reached for: a red icon that always glows is the loudest thing on a calm page. -->
    <TooltipIconButton
      on:click={onDelete}
      class="{navButtonClass} hover:!bg-[color-mix(in_srgb,var(--red)_12%,transparent)] hover:!text-[var(--red)] focus-visible:text-[var(--red)]"
      label={$localizedText.editor.moveToTrash}
      tooltip={$localizedText.editor.moveToTrash}
      tooltipAlign="end"
    >
      <Trash2 class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
  </div>
  <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 lg:gap-12 px-2 lg:px-0" class:hidden={folded}>
    <div class="flex-1 min-w-0">
      <input
        type="text"
        bind:value={editedTitle}
        on:input={onTitleInput}
        on:focus={() => { titleFocused = true; }}
        on:blur={() => { titleFocused = false; onCommitTitle(); }}
        on:keydown={titleKeydown}
        aria-label={$localizedText.editorHeader.noteTitle}
        placeholder={$localizedText.editorHeader.noteTitle}
        class="text-lg lg:text-2xl leading-tight font-serif font-medium tracking-tight bg-transparent outline-none w-full py-1.5 !border-none"
      />
      {#if fileInfo}
        <div class="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4 text-[length:var(--text-whisper)] lg:gap-y-1 lg:text-[length:var(--text-whisper-lg)]">
          <!-- One date on the line; when the note was made is in the tooltip. Items are set apart by even space, not by dots. -->
          <p class="text-[var(--text-tertiary)]" title="{$localizedText.editorHeader.created} {formatDateTime(fileInfo.created)}">
            {$localizedText.editorHeader.modified} {formatDateTime(fileInfo.modified)}
          </p>
          {#if wordCharStats}
            <span class="hidden tabular-nums text-[var(--text-tertiary)] sm:inline">{wordCharStats}</span>
          {/if}
          {#if taskProgress && taskProgress.total > 0}
            <span
              class="hidden items-center gap-2 text-[var(--text-tertiary)] sm:inline-flex"
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
          <!-- Actions on the note read like the bottom bar's, in sentence case; capitals are kept for labels. -->
          <span class="ml-auto flex items-center gap-4">
            <button
              type="button"
              aria-expanded={outlineOpen}
              data-testid="outline-toggle"
              on:click={onToggleOutline}
              class="-my-4 py-4 text-xs transition hover:text-[var(--text-primary)] lg:my-0 lg:py-0 {outlineOpen ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            >
              {$localizedText.editor.outline}
            </button>
            {#if historyAvailable}
              <button
                type="button"
                on:click={onOpenHistory}
                class="-my-4 inline-flex items-center gap-1.5 py-4 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] lg:my-0 lg:py-0"
              >
                <History size="12" strokeWidth="1.7" aria-hidden="true" />
                {$localizedText.editorHeader.historyButton}
              </button>
            {/if}
            <button
              type="button"
              on:click={browserPrint}
              class="-my-4 py-4 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] lg:my-0 lg:py-0"
            >
              {$localizedText.editorHeader.print}
            </button>
          </span>
        </div>
      {/if}
    </div>
  </div>
</header>
