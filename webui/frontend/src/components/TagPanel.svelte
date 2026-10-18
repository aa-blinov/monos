<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import SearchField from './SearchField.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { localizedText } from '../lib/strings.js';
  import { deleteTag, filterTagStats, loadTagStats, renameTag } from '../lib/tags.js';
  import { Hash, Pencil, Trash2 } from 'lucide-svelte';

  export let open = false;

  const dispatch = createEventDispatcher();

  let stats = [];
  let filter = '';
  let loading = true;
  let error = '';
  let editing = null;
  let editValue = '';
  let busy = false;
  // A tag removal rewrites every note that carries it, so it waits for confirmation.
  let pendingRemoval = null;

  $: visible = filterTagStats(stats, filter);

  async function refresh() {
    loading = true;
    error = '';
    try {
      stats = await loadTagStats();
    } catch (loadError) {
      error = loadError?.message || String(loadError);
    } finally {
      loading = false;
    }
  }

  // Панель открывают из боковой панели, и к этому моменту список уже мог
  // устареть: перечитываем при каждом открытии, а не один раз при загрузке.
  $: if (open) refresh();

  function startRename(tag) {
    editing = tag;
    editValue = tag;
    error = '';
  }

  async function confirmRename() {
    const from = editing;
    const to = editValue.trim();
    if (!from || !to || to === from) {
      editing = null;
      return;
    }
    busy = true;
    error = '';
    try {
      const result = await renameTag(from, to);
      editing = null;
      await refresh();
      dispatch('changed', { kind: 'rename', from, to, changed: result?.changed?.length ?? 0 });
    } catch (renameError) {
      error = renameError?.message || String(renameError);
    } finally {
      busy = false;
    }
  }

  async function remove(tag) {
    busy = true;
    error = '';
    try {
      const result = await deleteTag(tag);
      await refresh();
      dispatch('changed', { kind: 'delete', tag, changed: result?.changed?.length ?? 0 });
    } catch (deleteError) {
      error = deleteError?.message || String(deleteError);
    } finally {
      busy = false;
    }
  }

  function askRemove(entry) {
    pendingRemoval = entry;
  }

  async function confirmRemoval() {
    const tag = pendingRemoval?.tag;
    pendingRemoval = null;
    if (tag) await remove(tag);
  }

  function openTag(tag) {
    dispatch('select', { tag });
    open = false;
  }
</script>

{#if open}
  <ModalShell
    title={$localizedText.tags.title}
    widthClass="w-[min(94vw,34rem)]"
    closeOnEscape={true}
    on:close={() => open = false}
  >
    <div class="space-y-3">
      <SearchField testid="tag-filter" placeholder={$localizedText.tags.filter} bind:value={filter} />

      {#if error}
        <p class="text-sm text-[var(--red)]">{error}</p>
      {/if}

      {#if loading}
        <p class="py-6 text-center text-[length:var(--text-whisper-lg)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          {$localizedText.tags.loading}
        </p>
      {:else if visible.length === 0}
        <p class="py-6 text-center text-sm text-[var(--text-tertiary)]">
          {filter ? $localizedText.tags.emptyFiltered : $localizedText.tags.empty}
        </p>
      {:else}
        <ul class="max-h-[26rem] divide-y divide-[var(--border-subtle)] overflow-y-auto">
          {#each visible as entry (entry.tag)}
            <li class="flex items-center gap-2 py-1.5">
              {#if editing === entry.tag}
                <input
                  data-testid="tag-rename-input"
                  type="text"
                  class="min-w-0 flex-1 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2 py-1.5 text-sm outline-none focus:border-[var(--text-primary)]"
                  bind:value={editValue}
                  on:keydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') editing = null; }}
                />
                <button
                  type="button"
                  data-testid="tag-rename-save"
                  disabled={busy}
                  class={getModalButtonClass('primary', { extraClass: 'px-3 py-1 text-sm' })}
                  on:click={confirmRename}
                >{$localizedText.tags.save}</button>
                <button
                  type="button"
                  class={getModalButtonClass('secondary', { extraClass: 'px-2 py-1 text-sm' })}
                  on:click={() => editing = null}
                >{$localizedText.tags.cancel}</button>
              {:else}
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 rounded-ui px-2 py-1 text-left transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)]"
                  on:click={() => openTag(entry.tag)}
                >
                  <Hash size="12" strokeWidth="1.7" class="shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
                  <span class="truncate text-sm text-[var(--text-primary)]">{entry.tag}</span>
                </button>
                <span class="shrink-0 tabular-nums text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{entry.count}</span>
                <button
                  type="button"
                  data-testid="tag-rename"
                  aria-label={$localizedText.tags.rename(entry.tag)}
                  class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_70%,transparent)] hover:text-[var(--text-primary)]"
                  on:click={() => startRename(entry.tag)}
                >
                  <Pencil size="14" strokeWidth="1.7" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  data-testid="tag-delete"
                  aria-label={$localizedText.tags.drop(entry.tag)}
                  class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_70%,transparent)] hover:text-[var(--red)]"
                  on:click={() => askRemove(entry)}
                >
                  <Trash2 size="14" strokeWidth="1.7" aria-hidden="true" />
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    {#if pendingRemoval}
      <ConfirmModal
        danger={true}
        title={$localizedText.tags.dropConfirmTitle}
        message={$localizedText.tags.dropConfirm(pendingRemoval.tag, pendingRemoval.count)}
        confirmLabel={$localizedText.tags.dropConfirmAction}
        on:confirm={confirmRemoval}
        on:cancel={() => { pendingRemoval = null; }}
      />
    {/if}
  </ModalShell>
{/if}