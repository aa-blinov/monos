<script>
  import { scrollBehavior } from '../lib/motion.js';
  /**
   * The Help: how to use Monos, topic by topic, with a FAQ, in the interface language. Sections on the left,
   * the topics on the right; the search above finds a topic by any of its words and shows why it matched.
   */
  import { onMount, tick } from 'svelte';
  import SearchField from './SearchField.svelte';
  import { locale, localizedText } from '../lib/strings.js';
  import { helpSections } from '../lib/help-content.js';
  import { searchHelp } from '../lib/help-search.js';
  import { renderMarkdownPreview } from '../lib/preview-html.js';
  import { platformKeys } from '../lib/shortcut-label.js';

  let query = '';
  let searchField;
  let activeSection = '';
  let scroller;

  // The text is written with the Mac's symbols; the keys of this computer are shown.
  const forThisComputer = (list) => list.map((section) => ({
    ...section,
    title: platformKeys(section.title),
    summary: section.summary ? platformKeys(section.summary) : section.summary,
    items: section.items.map((item) => ({ ...item, title: platformKeys(item.title), body: platformKeys(item.body) })),
  }));
  $: sections = forThisComputer(helpSections($locale));
  $: results = searchHelp(sections, query);
  $: if (!activeSection && sections.length) activeSection = sections[0].id;

  onMount(() => searchField?.focus());

  async function go(sectionId, itemId) {
    query = '';
    activeSection = sectionId;
    await tick();
    const target = document.getElementById(itemId ? `help-${sectionId}-${itemId}` : `help-${sectionId}`);
    target?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    if (itemId) {
      target?.classList.add('help-flash');
      setTimeout(() => target?.classList.remove('help-flash'), 1400);
    }
  }

  // The section in view is marked in the list on the left.
  function trackSection() {
    if (query || !scroller) return;
    const top = scroller.getBoundingClientRect().top + 80;
    for (const section of [...sections].reverse()) {
      const element = document.getElementById(`help-${section.id}`);
      if (element && element.getBoundingClientRect().top <= top) {
        activeSection = section.id;
        return;
      }
    }
    activeSection = sections[0]?.id || '';
  }

  function highlight(text) {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const escape = (value) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    let html = escape(text);
    for (const word of words) {
      const pattern = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]')})`, 'gi');
      html = html.replace(pattern, '<mark>$1</mark>');
    }
    return html;
  }
</script>

<div class="flex h-full min-h-0 flex-col" data-testid="help-view">
  <div class="shrink-0 border-b border-[var(--border-subtle)] px-4 pb-4 pt-4 sm:pt-6 lg:px-12 lg:pt-8">
    <div class="mx-auto max-w-5xl">
      <h1 class="font-serif text-3xl tracking-tight">{$localizedText.help.title}</h1>
      <p class="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.help.subtitle}</p>
      <SearchField class="mt-5" bind:value={query} bind:inputEl={searchField} testid="help-search" placeholder={$localizedText.help.searchPlaceholder} />
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-12" bind:this={scroller} on:scroll={trackSection}>
    <div class="mx-auto flex max-w-5xl gap-10">
      <!-- Sections, in view while reading; hidden on a phone, where the search does the finding. -->
      <nav class="sticky top-6 hidden w-52 shrink-0 self-start md:block" aria-label={$localizedText.help.sections}>
        <ul class="space-y-0.5">
          {#each sections as section (section.id)}
            <li>
              <button
                type="button"
                on:click={() => go(section.id)}
                class="w-full rounded-ui px-2 py-1.5 text-left text-sm transition {activeSection === section.id && !query ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
              >{section.title}</button>
            </li>
          {/each}
        </ul>
      </nav>

      <div class="min-w-0 flex-1">
        {#if query.trim()}
          <p class="mb-4 text-xs text-[var(--text-tertiary)]" role="status">{$localizedText.help.found(results.length)}</p>
          {#if results.length === 0}
            <p class="text-sm text-[var(--text-secondary)]">{$localizedText.help.nothing}</p>
          {:else}
            <ul class="space-y-2" data-testid="help-results">
              {#each results as result (`${result.sectionId}/${result.itemId}`)}
                <li>
                  <button type="button" class="w-full rounded-ui border border-[var(--border-subtle)] px-4 py-3 text-left transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)]" on:click={() => go(result.sectionId, result.itemId)}>
                    <span class="block text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{result.sectionTitle}</span>
                    <span class="mt-0.5 block text-sm font-bold text-[var(--text-primary)]">{@html highlight(result.title)}</span>
                    <span class="mt-1 block text-xs leading-relaxed text-[var(--text-secondary)]">{@html highlight(result.excerpt)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          {#each sections as section (section.id)}
            <section id="help-{section.id}" class="mb-12 scroll-mt-6">
              <h2 class="font-serif text-2xl tracking-tight">{section.title}</h2>
              {#if section.summary}<p class="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{section.summary}</p>{/if}
              <div class="mt-5 space-y-6">
                {#each section.items as item (item.id)}
                  <article id="help-{section.id}-{item.id}" class="help-item scroll-mt-6 rounded-ui">
                    <h3 class="text-base font-bold text-[var(--text-primary)]">{item.title}</h3>
                    <div class="help-body mt-1.5" class:help-keys={item.id === 'shortcuts'}>{@html renderMarkdownPreview(item.body)}</div>
                  </article>
                {/each}
              </div>
            </section>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .help-body :global(p) { margin: 0 0 0.6rem; font-size: 0.875rem; line-height: 1.7; color: var(--text-secondary); }
  .help-body :global(ul),
  .help-body :global(ol) { margin: 0 0 0.6rem; padding-left: 1.3em; font-size: 0.875rem; line-height: 1.7; color: var(--text-secondary); }
  .help-body :global(ul) { list-style: disc; }
  .help-body :global(ol) { list-style: decimal; }
  .help-body :global(strong) { color: var(--text-primary); }
  .help-body :global(code) { background: var(--bg-secondary); padding: 0.05em 0.35em; border-radius: var(--radius); font-size: 0.85em; color: var(--text-primary); }
  .help-body :global(table) { margin: 0 0 0.6rem; border-collapse: collapse; font-size: 0.8125rem; }
  .help-body :global(th),
  .help-body :global(td) { border: 1px solid var(--border-subtle); padding: 0.3rem 0.6rem; text-align: left; color: var(--text-secondary); }
  .help-body :global(th) { color: var(--text-primary); background: var(--bg-secondary); }
  /* The Keys column reads as keys. */
  .help-keys :global(td:first-child code) { display: inline-block; margin: 0.1rem 0.15rem 0.1rem 0; padding: 0.1rem 0.45rem; border: 1px solid var(--border-subtle); border-bottom-width: 2px; border-radius: var(--radius); background: var(--bg-secondary); font-size: 0.95em; line-height: 1.35; white-space: nowrap; }
  .help-keys :global(td:first-child) { white-space: normal; }
  .help-keys :global(table) { width: 100%; max-width: 40rem; margin-bottom: 1rem; }
  @media (min-width: 640px) { .help-keys :global(th:first-child) { width: 13rem; } }
  .help-keys :global(p) { margin: 1rem 0 0.35rem; color: var(--text-primary); }
  :global(.help-item) { transition: background-color 0.6s ease; }
  :global(.help-item.help-flash) { background: color-mix(in srgb, var(--yellow) 18%, transparent); }
  :global([data-testid="help-results"] mark),
  :global([data-testid="help-view"] mark) { background: color-mix(in srgb, var(--yellow) 35%, transparent); color: inherit; border-radius: var(--radius); }
</style>
