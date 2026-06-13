<script>
  import { onMount } from 'svelte';
  import { EyeOff, Eye, Pencil, Plus, Trash2 } from 'lucide-svelte';
  import ModalShell from './ModalShell.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
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
  $: hiddenCount = libraryTemplates.filter((template) => template.hidden).length;
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

  async function removeCustomTemplate(template) {
    if (!template?.id) return;
    if (!confirm($localizedText.templates.deleteConfirm(template.title))) return;
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
    <div class="mb-5 flex items-center justify-between gap-4">
      <div class="min-w-0">
        <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.templates.title}</h1>
      </div>
      <div class="shrink-0 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        {$customNoteTemplates.length} / {hiddenCount}
      </div>
    </div>

    <div class="mb-7">
      <input
        type="text"
        bind:value={query}
        placeholder={$localizedText.templates.searchPlaceholder}
        class="w-full rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/30 px-4 py-2 text-sm outline-none"
      />
    </div>

    <div class="grid gap-9">
      <section>
        <div class="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 class="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]">{$localizedText.templates.myTemplates}</h2>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] transition hover:border-[var(--text-secondary)]/50 hover:bg-[var(--bg-secondary)]"
            on:click={openNewTemplate}
          >
            <Plus size="16" strokeWidth="1.7" aria-hidden="true" />
            <span>{$localizedText.templates.newTemplate}</span>
          </button>
        </div>

        {#if filteredCustomTemplates.length === 0}
          <div class="rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center text-sm text-[var(--text-secondary)]">
            {$localizedText.templates.noCustomTemplates}
          </div>
        {:else}
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {#each filteredCustomTemplates as template (template.id)}
              <article class="rounded-2xl border border-[var(--border-subtle)] p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate font-serif text-lg tracking-tight">{template.title}</h3>
                    {#if template.description}
                      <p class="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">{template.description}</p>
                    {/if}
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <TooltipIconButton type="button" class="h-9 w-9 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]" label={$localizedText.templates.edit} tooltip={$localizedText.templates.edit} on:click={() => editTemplate(template)}>
                      <Pencil size="16" strokeWidth="1.7" aria-hidden="true" />
                    </TooltipIconButton>
                    <TooltipIconButton type="button" class="h-9 w-9 rounded-full text-red-400 hover:bg-red-500/10" label={$localizedText.templates.delete} tooltip={$localizedText.templates.delete} on:click={() => removeCustomTemplate(template)}>
                      <Trash2 size="16" strokeWidth="1.7" aria-hidden="true" />
                    </TooltipIconButton>
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap gap-1.5">
                  {#if template.category}
                    <span class="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-secondary)]/70">{template.category}</span>
                  {/if}
                  {#each template.tags as tag}
                    <span class="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-secondary)]/70">#{tag}</span>
                  {/each}
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

        <div class="space-y-7">
          {#each libraryGroups as group (group.key)}
            <section>
              <div class="mb-3">
                <div class="flex items-center gap-3">
                  <h3 class="shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-secondary)]/80">{group.title}</h3>
                  <span class="h-px flex-1 bg-[var(--border-subtle)]"></span>
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {#each group.templates as template (template.id)}
                  <article class="rounded-2xl border border-[var(--border-subtle)] p-4 opacity-100 {template.hidden ? 'opacity-55' : ''}">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h4 class="truncate font-serif text-lg tracking-tight">{template.title}</h4>
                        <div class="mt-1 text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)]/60">{template.category}</div>
                      </div>
                      <TooltipIconButton
                        type="button"
                        class="h-9 w-9 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                        label={template.hidden ? $localizedText.templates.show : $localizedText.templates.hide}
                        tooltip={template.hidden ? $localizedText.templates.show : $localizedText.templates.hide}
                        on:click={() => toggleLibraryTemplate(template)}
                      >
                        {#if template.hidden}
                          <Eye size="16" strokeWidth="1.7" aria-hidden="true" />
                        {:else}
                          <EyeOff size="16" strokeWidth="1.7" aria-hidden="true" />
                        {/if}
                      </TooltipIconButton>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      {#each template.tags as tag}
                        <span class="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-secondary)]/70">#{tag}</span>
                      {/each}
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
        <input id="template-manager-title" bind:value={form.title} class="w-full border-b border-[var(--border-subtle)] bg-transparent py-2 text-sm outline-none" />
      </div>
      <div>
        <label for="template-manager-description" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.description}</label>
        <input id="template-manager-description" bind:value={form.description} class="w-full border-b border-[var(--border-subtle)] bg-transparent py-2 text-sm outline-none" />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="template-manager-category" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.folder}</label>
          <input id="template-manager-category" bind:value={form.category} class="w-full border-b border-[var(--border-subtle)] bg-transparent py-2 text-sm outline-none" />
        </div>
        <div>
          <label for="template-manager-tags" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.tags}</label>
          <input id="template-manager-tags" bind:value={form.tags} placeholder="project, idea" class="w-full border-b border-[var(--border-subtle)] bg-transparent py-2 text-sm outline-none" />
        </div>
      </div>
      <div>
        <label for="template-manager-content" class="mb-1.5 block text-xs text-[var(--text-secondary)]">{$localizedText.templates.content}</label>
        <textarea
          id="template-manager-content"
          bind:value={form.content}
          rows="12"
          class="w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/30 p-3 font-mono text-xs leading-relaxed outline-none"
        ></textarea>
        <p class="mt-2 text-[11px] text-[var(--text-secondary)]/60">{$localizedText.templates.placeholders}</p>
      </div>

      </div>
    </div>

    <div class="mt-6 flex shrink-0 gap-4">
      <button type="button" on:click={closeForm} class="flex-1 text-sm font-medium transition hover:opacity-60">
        {$localizedText.sidebar.modals.cancel}
      </button>
      <button type="button" on:click={submitTemplate} disabled={!form.title.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest transition hover:opacity-60 disabled:opacity-30">
        {form.id ? $localizedText.templates.saveChanges : $localizedText.templates.createTemplate}
      </button>
    </div>
  </ModalShell>
{/if}
