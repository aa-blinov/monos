<script>
  import { localizedText } from '../lib/strings.js';

  export let editedTitle = '';
  export let currentFile = null;
  export let fileInfo = null;
  export let wordCharStats = '';

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
        <div class="mb-1.5 flex min-w-0 flex-wrap items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]/70">
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
        class="text-lg lg:text-2xl xl:text-[1.7rem] leading-tight font-serif font-medium tracking-tight bg-transparent outline-none w-full pb-1 !border-none"
      />
      {#if fileInfo}
        <div class="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] lg:text-[11px]">
          <p class="text-[var(--text-muted)] lg:hidden">
            {$localizedText.editorHeader.modified} {new Date(fileInfo.modified).toLocaleString()}
          </p>
          <p class="hidden text-[var(--text-muted)] lg:block">
            {$localizedText.editorHeader.created} {new Date(fileInfo.created).toLocaleString()} · {$localizedText.editorHeader.modified} {new Date(fileInfo.modified).toLocaleString()}
          </p>
          <span class="hidden tabular-nums text-[var(--text-muted)] sm:inline">{wordCharStats}</span>
        </div>
      {/if}
    </div>
  </div>
</div>
