<script>
  import { locale, localizedText } from '../lib/strings.js';
  import { printNoteToPdf, openPrintView } from '../lib/print.js';
  import { Printer, History } from 'lucide-svelte';

  export let editedTitle = '';
  export let currentFile = null;
  export let fileInfo = null;
  export let wordCharStats = '';
  export let taskProgress = null;
  export let historyAvailable = false;
  export let onOpenHistory = () => {};

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

  let printError = '';
  let isPrinting = false;

  async function exportPdf() {
    if (!currentFile?.path || isPrinting) return;
    printError = '';
    isPrinting = true;
    try {
      await printNoteToPdf(currentFile.path);
    } catch (error) {
      printError = error?.message || String(error);
    } finally {
      isPrinting = false;
    }
  }

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
        name,
        path: `notes/${parts.slice(0, index + 1).join('/')}`,
      }))
    : [];
</script>

<div class="px-4 lg:px-12 pt-3 pb-2 lg:pt-5 lg:pb-3 space-y-2 lg:space-y-3">
  <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 lg:gap-12">
    <div class="flex-1 min-w-0">
      {#if breadcrumbParts.length > 0}
        <div class="mb-1.5 flex min-w-0 flex-wrap items-center gap-1 text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          {#each breadcrumbParts as part, index}
            {#if index > 0}
              <span class="opacity-40">/</span>
            {/if}
            <span class="max-w-[12rem] truncate">
              {part.name}
            </span>
          {/each}
        </div>
      {/if}
      <input
        type="text"
        bind:value={editedTitle}
        placeholder={$localizedText.editorHeader.noteTitle}
        class="text-lg lg:text-2xl xl:text-[1.7rem] leading-tight font-serif font-medium tracking-tight bg-transparent outline-none w-full py-1.5 !border-none"
      />
      {#if fileInfo}
        <div class="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-whisper)] lg:text-[length:var(--text-whisper-lg)]">
          <p class="text-[var(--text-muted)] lg:hidden">
            {$localizedText.editorHeader.modified} {formatDateTime(fileInfo.modified)}
          </p>
          <p class="hidden text-[var(--text-muted)] lg:block">
            {$localizedText.editorHeader.created} {formatDateTime(fileInfo.created)} · {$localizedText.editorHeader.modified} {formatDateTime(fileInfo.modified)}
          </p>
          <span class="hidden tabular-nums text-[var(--text-muted)] sm:inline">{wordCharStats}</span>
          {#if taskProgress && taskProgress.total > 0}
            <span
              class="hidden items-center gap-2 text-[var(--text-muted)] sm:inline-flex"
              data-testid="task-progress"
              title={taskProgress.isComplete
                ? $localizedText.editorHeader.taskProgress.complete
                : $localizedText.editorHeader.taskProgress.percent(taskProgress.percent)}
            >
              <span
                class="h-1 w-14 overflow-hidden rounded-full bg-[var(--bg-secondary)]"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={taskProgress.percent}
              >
                <span
                  class="block h-full rounded-full transition-[width] duration-300"
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
          <span class="ml-auto flex items-center gap-4">
            <button
              type="button"
              disabled={isPrinting}
              on:click={exportPdf}
              class="inline-flex items-center gap-1.5 uppercase tracking-[0.12em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-30"
            >
              <Printer size="12" strokeWidth="1.7" aria-hidden="true" />
              {$localizedText.editorHeader.exportPdf}
            </button>
            {#if historyAvailable}
              <button
                type="button"
                on:click={onOpenHistory}
                class="inline-flex items-center gap-1.5 uppercase tracking-[0.12em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                <History size="12" strokeWidth="1.7" aria-hidden="true" />
                {$localizedText.editorHeader.historyButton}
              </button>
            {/if}
            <button
              type="button"
              on:click={browserPrint}
              class="uppercase tracking-[0.12em] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              {$localizedText.editorHeader.print}
            </button>
          </span>
        </div>
        {#if printError}
          <p class="mt-2 text-[length:var(--text-whisper)] text-[var(--red)]">{printError}</p>
        {/if}
      {/if}
    </div>
  </div>
</div>
