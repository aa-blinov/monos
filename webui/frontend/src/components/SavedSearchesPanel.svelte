<script>
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { Button, IconButton } from '@monos/ui';
  import { localizedText } from '../lib/strings.js';
  import {
    addSavedSearch,
    loadSavedSearches,
    removeSavedSearch,
    renameSavedSearch,
    savedSearches,
  } from '../lib/saved-searches.js';
  import { Bookmark, Pencil, Trash2 } from 'lucide-svelte';

  export let open = false;
  export let currentQuery = '';

  const dispatch = createEventDispatcher();

  let name = '';
  let editing = null;
  let editValue = '';
  let busy = false;
  let error = '';

  $: if (open) loadSavedSearches();
  $: trimmedQuery = String(currentQuery || '').trim();
  /** Повторное сохранение того же запроса меняет только название. */
  $: alreadySaved = $savedSearches.some((entry) => entry.query === trimmedQuery);

  async function save() {
    if (!trimmedQuery) {
      error = $localizedText.savedSearches.nothingToSave;
      return;
    }
    busy = true;
    error = '';
    try {
      const saved = await addSavedSearch(name, trimmedQuery);
      name = '';
      if (saved) dispatch('saved', saved);
    } catch (saveError) {
      error = saveError?.message || String(saveError);
    } finally {
      busy = false;
    }
  }

  function startRename(entry) {
    editing = entry.id;
    editValue = entry.name;
    error = '';
  }

  async function confirmRename() {
    if (!editing) return;
    const id = editing;
    editing = null;
    busy = true;
    error = '';
    try {
      await renameSavedSearch(id, editValue);
    } catch (renameError) {
      error = renameError?.message || String(renameError);
    } finally {
      busy = false;
    }
  }

  async function remove(entry) {
    busy = true;
    error = '';
    try {
      await removeSavedSearch(entry.id);
    } catch (removeError) {
      error = removeError?.message || String(removeError);
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <ModalShell
    title={$localizedText.savedSearches.title}
    widthClass="w-[min(94vw,34rem)]"
    closeOnEscape={true}
    on:close={() => open = false}
  >
    <div class="space-y-3">
      <!--
        Управление повторяет панель тегов: полноширинная пилюля сверху, а
        под ней — тихий контекст и действие. Узкое поле между двумя надписями
        читалось как третье поле рядом с двумя другими.
      -->
      <!-- Opened to run a search, the panel shows the list first: the form to save one only appears once there
           is a query to save. -->
      {#if trimmedQuery}
      <input
        data-testid="saved-search-name"
        type="text"
        class="h-9 w-full rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-sm outline-none placeholder-[var(--text-secondary)] focus:border-[var(--text-primary)]"
        placeholder={$localizedText.savedSearches.namePlaceholder}
        bind:value={name}
        on:keydown={(e) => { if (e.key === 'Enter') save(); }}
      />

      <!--
        Запрос и действие разделены пробелом, а не стоят вплотную: моноширинное
        значение и прописная надпись, слипшиеся в одну строку, читаются как одно
        предложение. Действие уходит вправо — как кластер ИСТОРИЯ/ПЕЧАТЬ
        в шапке, но без flex-1 из базового класса, иначе кнопка растянется.

        Строка совмещается с рамкой поля по обоим краям: запрос начинается там
        же, где рамка, и действие кончается там же, где она. Собственный отступ
        строки свёл бы их к разным вертикальным линиям.
      -->
      <div class="flex items-baseline gap-4">
        <p class="min-w-0 truncate font-mono text-sm text-[var(--text-secondary)]">
          {#if trimmedQuery}
            {trimmedQuery}
          {:else}
            <span class="font-sans text-[var(--text-tertiary)]">{$localizedText.savedSearches.queryPlaceholder}</span>
          {/if}
        </p>
        <Button variant="primary" size="sm" data-testid="saved-search-save" disabled={busy || !trimmedQuery} class="ml-auto" on:click={save}>
          {alreadySaved
            ? $localizedText.savedSearches.renameHint
            : $localizedText.savedSearches.save}
        </Button>
      </div>
      {:else}
        <p class="text-xs leading-relaxed text-[var(--text-tertiary)]" data-testid="saved-search-howto">{$localizedText.savedSearches.howToSave}</p>
      {/if}

      {#if error}
        <p class="text-sm text-[var(--red)]">{error}</p>
      {/if}

      {#if $savedSearches.length === 0}
        <p class="py-6 text-center text-[length:var(--text-whisper-lg)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          {$localizedText.savedSearches.empty}
        </p>
      {:else}
        <ul class="max-h-[26rem] divide-y divide-[var(--border-subtle)] overflow-y-auto">
          {#each $savedSearches as entry (entry.id)}
            <li class="flex items-center gap-2 py-1.5">
              {#if editing === entry.id}
                <input
                  data-testid="saved-search-rename-input"
                  type="text"
                  class="h-9 min-w-0 flex-1 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-sm outline-none focus:border-[var(--text-primary)]"
                  bind:value={editValue}
                  on:keydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') editing = null; }}
                />
                <Button variant="primary" size="sm" data-testid="saved-search-rename-save" disabled={busy} on:click={confirmRename}>{$localizedText.savedSearches.save}</Button>
              {:else}
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="saved-search-run"
                  class="min-w-0 flex-1 justify-start gap-2 px-2 normal-case"
                  on:click={() => { dispatch('run', entry); open = false; }}
                >
                  <Bookmark size="12" strokeWidth="1.7" class="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-[var(--text-primary)]">{entry.name}</span>
                    <span class="block truncate font-mono text-[length:var(--text-whisper-lg)] text-[var(--text-secondary)]">{entry.query}</span>
                  </span>
                </Button>
                <IconButton bare tooltipText="" data-testid="saved-search-rename" label={$localizedText.savedSearches.rename(entry.name)} class="h-7 w-7 shrink-0 text-ink-soft" on:click={() => startRename(entry)}>
                  <Pencil size="12" strokeWidth="1.7" aria-hidden="true" />
                </IconButton>
                <IconButton bare tooltipText="" data-testid="saved-search-delete" label={$localizedText.savedSearches.remove(entry.name)} class="h-7 w-7 shrink-0 text-ink-soft text-danger-text" on:click={() => remove(entry)}>
                  <Trash2 size="12" strokeWidth="1.7" aria-hidden="true" />
                </IconButton>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </ModalShell>
{/if}
