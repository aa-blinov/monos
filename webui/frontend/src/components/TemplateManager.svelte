<script>
  import { onMount } from 'svelte';
  import { EyeOff, Eye, Pencil, Plus, Trash2 } from 'lucide-svelte';
  import ModalShell from './ModalShell.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import SearchField from './SearchField.svelte';
  import {
    customNoteTemplates,
    deleteCustomTemplate,
    getLibraryTemplatesForManagement,
    hiddenLibraryTemplateIds,
    hideLibraryTemplate,
    loadTemplateSettings,
    saveCustomTemplate,
    showLibraryTemplate,
  } from '../lib/template-library.js';
  import { locale, localizedText } from '../lib/strings.js';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { templateRequest } from '../stores.js';

  let pendingDelete = null;

  const emptyForm = {
    id: '',
    title: '',
    description: '',
    category: '',
    tags: '',
    content: '# {{title}}\n\n',
  };

  let form = { ...emptyForm };
  let query = '';
  let showFormModal = false;

  $: libraryTemplates = getLibraryTemplatesForManagement($locale, $hiddenLibraryTemplateIds);
  $: normalizedQuery = query.trim().toLowerCase();
  $: filteredLibraryTemplates = filterTemplates(libraryTemplates, normalizedQuery);
  $: filteredCustomTemplates = filterTemplates($customNoteTemplates, normalizedQuery);
  $: libraryGroups = groupTemplates(filteredLibraryTemplates, (template) => template.approach || 'system');
  function filterTemplates(templates, searchQuery) {
    if (!searchQuery) return templates;
    return templates.filter((template) => [
      template.title,
      template.description,
      template.approachTitle,
      template.approachDescription,
      template.category,
      ...(template.tags || []),
    ].join(' ').toLowerCase().includes(searchQuery));
  }

  function groupTemplates(templates, keyFn) {
    return Array.from(new Set(templates.map(keyFn))).map((key) => {
      const groupTemplates = templates.filter((template) => keyFn(template) === key);
      const firstTemplate = groupTemplates[0];
      return {
        key,
        title: firstTemplate?.approachTitle || firstTemplate?.group || key,
        description: firstTemplate?.approachDescription || '',
        templates: groupTemplates,
      };
    });
  }

  function editTemplate(template) {
    form = {
      id: template.id,
      title: template.title,
      description: template.description || '',
      category: template.category || '',
      tags: (template.tags || []).join(', '),
      content: template.content || '',
    };
    showFormModal = true;
  }

  function openNewTemplate() {
    form = { ...emptyForm };
    showFormModal = true;
  }

  function closeForm() {
    showFormModal = false;
    form = { ...emptyForm };
  }

  async function submitTemplate() {
    const saved = await saveCustomTemplate(form);
    if (!saved) return;
    closeForm();
  }

  function requestRemoveCustomTemplate(template) {
    if (!template?.id) return;
    pendingDelete = template;
  }

  function cancelRemoveCustomTemplate() {
    pendingDelete = null;
  }

  async function removeCustomTemplate(template) {
    if (!template?.id) return;
    pendingDelete = null;
    await deleteCustomTemplate(template.id);
    if (form.id === template.id) closeForm();
  }

  async function toggleLibraryTemplate(template) {
    if (!template?.id) return;
    if (template.hidden) await showLibraryTemplate(template.id);
    else await hideLibraryTemplate(template.id);
  }

  onMount(() => {
    void loadTemplateSettings();
  });
</script>

<div class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8">
  <div class="mx-auto max-w-5xl">
    <div class="mb-7">
      <div class="min-w-0">
        <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.templates.title}</h1>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {$localizedText.templates.hint}
        </p>
      </div>
    </div>

    <div class="mb-7">
      <SearchField bind:value={query} placeholder={$localizedText.templates.searchPlaceholder} />
    </div>

    <div class="grid gap-4">
      <section>
        <div class="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 class="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">{$localizedText.templates.myTemplates}</h2>
          </div>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:opacity-60"
            on:click={openNewTemplate}
          >
            <Plus size="16" strokeWidth="1.7" aria-hidden="true" />
            <span>{$localizedText.templates.newTemplate}</span>
          </button>
        </div>

        {#if filteredCustomTemplates.length === 0}
          <div class="rounded-ui border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center text-sm text-[var(--text-secondary)]">
            {$localizedText.templates.noCustomTemplates}
          </div>
        {:else}
          <div class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {#each filteredCustomTemplates as template (template.id)}
              <article class="rounded-ui border border-[var(--border-subtle)] p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="break-words font-serif text-lg tracking-tight">{template.title}</h3>
                    {#if template.description}
                      <p class="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">{template.description}</p>
                    {/if}
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <TooltipIconButton type="button" class="h-9 w-9 rounded-ui text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" label={$localizedText.templates.edit} tooltip={$localizedText.templates.edit} on:click={() => editTemplate(template)}>
                      <Pencil size="16" strokeWidth="1.7" aria-hidden="true" />
                    </TooltipIconButton>
                    <TooltipIconButton type="button" class="h-9 w-9 rounded-ui text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_12%,transparent)]" label={$localizedText.templates.delete} tooltip={$localizedText.templates.delete} on:click={() => requestRemoveCustomTemplate(template)}>
                      <Trash2 size="16" strokeWidth="1.7" aria-hidden="true" />
                    </TooltipIconButton>
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap gap-1.5">
                  {#each template.tags as tag}
                    <span class="rounded-ui border border-[var(--border-subtle)] px-2 py-0.5 text-[length:var(--text-whisper)] text-[var(--text-secondary)]">#{tag}</span>
                  {/each}
                </div>
                <div class="mt-4 flex justify-end">
                  <button
                    type="button"
                    class="inline-flex h-8 items-center whitespace-nowrap text-xs uppercase tracking-[0.12em] text-[var(--text-primary)] transition hover:opacity-60"
                    on:click={() => templateRequest.set(template.id)}
                  >
                    {$localizedText.templates.createNote}
                  </button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <div class="mb-4">
          <h2 class="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">{$localizedText.templates.libraryTitle}</h2>
        </div>

        <div class="space-y-6">
          {#each libraryGroups as group (group.key)}
            <section>
              <div class="mb-3">
                <div class="flex items-center gap-3">
                  <h3 class="shrink-0 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{group.title}</h3>
                  <span class="h-px flex-1 bg-[var(--border-subtle)]"></span>
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {#each group.templates as template (template.id)}
                  <article class="rounded-ui border border-[var(--border-subtle)] p-4 opacity-100 {template.hidden ? 'opacity-55' : ''}">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h4 class="break-words font-serif text-lg tracking-tight">{template.title}</h4>
                      </div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      {#each template.tags as tag}
                        <span class="rounded-ui border border-[var(--border-subtle)] px-2 py-0.5 text-[length:var(--text-whisper)] text-[var(--text-secondary)]">#{tag}</span>
                      {/each}
                    </div>
                    <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        class="inline-flex h-8 mr-auto shrink-0 items-center gap-1.5 rounded-ui px-2 text-xs uppercase tracking-[0.12em] text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                        on:click={() => toggleLibraryTemplate(template)}
                      >
                        {#if template.hidden}
                          <EyeOff size="14" strokeWidth="1.7" aria-hidden="true" />
                          <span>{$localizedText.templates.show}</span>
                        {:else}
                          <Eye size="14" strokeWidth="1.7" aria-hidden="true" />
                          <span>{$localizedText.templates.hide}</span>
                        {/if}
                      </button>
                      {#if !template.hidden}
                        <button
                          type="button"
                          class="inline-flex h-8 items-center whitespace-nowrap text-xs uppercase tracking-[0.12em] text-[var(--text-primary)] transition hover:opacity-60"
                          on:click={() => templateRequest.set(template.id)}
                        >
                          {$localizedText.templates.createNote}
                        </button>
                      {/if}
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </section>
    </div>
  </div>
</div>

{#if showFormModal}
  <ModalShell title={form.id ? $localizedText.templates.edit : $localizedText.templates.newTemplate} widthClass="w-[min(94vw,52rem)] max-h-[88vh] overflow-hidden flex flex-col" closeOnEscape={true} on:close={closeForm}>
    <div class="min-h-0 overflow-y-auto pr-1">
      <div class="grid gap-4">
      <div>
        <label for="template-manager-title" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.templateTitle}</label>
        <input id="template-manager-title" bind:value={form.title} class={formFieldClass()} />
      </div>
      <div>
        <label for="template-manager-description" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.description}</label>
        <input id="template-manager-description" bind:value={form.description} class={formFieldClass()} />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="template-manager-category" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.folder}</label>
          <input id="template-manager-category" bind:value={form.category} class={formFieldClass()} />
        </div>
        <div>
          <label for="template-manager-tags" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.tags}</label>
          <input id="template-manager-tags" bind:value={form.tags} placeholder={$localizedText.templates.tagsPlaceholder} class={formFieldClass()} />
        </div>
      </div>
      <div>
        <label for="template-manager-content" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.content}</label>
        <textarea
          id="template-manager-content"
          bind:value={form.content}
          rows="12"
          class="w-full resize-y rounded-ui border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_30%,transparent)] p-3 font-mono text-xs leading-relaxed outline-none"
        ></textarea>
        <p class="mt-2 text-[length:var(--text-whisper-lg)] text-[var(--text-tertiary)]">{$localizedText.templates.placeholders}</p>
      </div>

      </div>
    </div>

    <div class="mt-6 flex shrink-0 gap-4">
      <button type="button" on:click={closeForm} class={getModalButtonClass('secondary')}>
        {$localizedText.sidebar.modals.cancel}
      </button>
      <button type="button" on:click={submitTemplate} disabled={!form.title.trim()} title={form.title.trim() ? undefined : $localizedText.templates.createTemplateHint} class={getModalButtonClass('primary', { disabled: !form.title.trim() })}>
        {form.id ? $localizedText.templates.saveChanges : $localizedText.templates.createTemplate}
      </button>
    </div>
  </ModalShell>
{/if}

{#if pendingDelete}
  <ConfirmModal
    danger={true}
    title={$localizedText.templates.delete}
    message={$localizedText.templates.deleteConfirm(pendingDelete.title)}
    confirmLabel={$localizedText.templates.delete}
    on:confirm={() => removeCustomTemplate(pendingDelete)}
    on:cancel={cancelRemoveCustomTemplate}
  />
{/if}
