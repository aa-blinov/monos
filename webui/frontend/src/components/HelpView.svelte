<script>
  import { scrollBehavior } from '../lib/motion.js';
  /**
   * The Help: how to use Monos, topic by topic, with a FAQ, in the interface language. Sections on the left,
   * the topics on the right; the search above finds a topic by any of its words and shows why it matched.
   */
  import { onMount, tick } from 'svelte';
  import { Button, FilterChip } from '@monos/ui';
  import SearchField from './SearchField.svelte';
  import { locale, localizedText } from '../lib/strings.js';
  import { helpSections } from '../lib/help-content.js';
  import { searchHelp } from '../lib/help-search.js';
  import { renderMarkdownPreview } from '../lib/preview-html.js';
  import { platformKeys } from '../lib/shortcut-label.js';

  let query = '';
  let searchField;
  let activeSection = '';
  let activeTopic = '';
  let scroller;
  let rootEl;
  let chipsEl;
  // Wide: the topics scroll under a fixed header. A phone has no room for a fixed header: the page scrolls as one.
  const wide = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)')?.matches;
  const container = () => (wide() ? scroller : rootEl);

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

  // The chip of the section in view is kept in sight inside the strip (a phone; the strip is hidden when wide).
  function keepChipInView() {
    Promise.resolve().then(() => {
      const chip = chipsEl?.querySelector('[aria-current="true"]');
      if (!chip || chipsEl.scrollWidth <= chipsEl.clientWidth) return;
      const left = chip.offsetLeft - 16;
      const right = chip.offsetLeft + chip.offsetWidth + 16;
      if (left < chipsEl.scrollLeft) chipsEl.scrollLeft = left;
      else if (right > chipsEl.scrollLeft + chipsEl.clientWidth) chipsEl.scrollLeft = right - chipsEl.clientWidth;
    });
  }

  onMount(() => {
    const topic = new URLSearchParams(window.location.search).get('topic');
    if (topic) {
      const [sectionId, itemId] = topic.split('/');
      if (helpSections($locale).some((section) => section.id === sectionId)) {
        go(sectionId, itemId);
        return;
      }
    }
    searchField?.focus();
  });

  // "/" focuses the search from anywhere in the Help; Esc in the search clears it.
  function helpKeys(event) {
    if (event.key === 'Escape' && query) { query = ''; return; }
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.target?.closest?.('input, textarea, select, [contenteditable]')) {
      event.preventDefault();
      searchField?.focus();
    }
  }

  function toTop() {
    container()?.scrollTo({ top: 0, behavior: scrollBehavior() });
    activeTopic = '';
  }

  // A topic has an address (`/help?topic=sync/auto`): a link, a reload or the browser's back lands on it.
  function rememberTopic(sectionId, itemId) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('topic', itemId ? `${sectionId}/${itemId}` : sectionId);
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // No address to keep: the page still works.
    }
  }

  async function go(sectionId, itemId) {
    query = '';
    activeSection = sectionId;
    activeTopic = itemId || '';
    keepChipInView();
    rememberTopic(sectionId, itemId);
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
    const box = container();
    if (query || !box) return;
    const top = box.getBoundingClientRect().top + (wide() ? 80 : 130);
    for (const section of [...sections].reverse()) {
      const element = document.getElementById(`help-${section.id}`);
      if (element && element.getBoundingClientRect().top <= top) {
        activeSection = section.id;
        // The topic in view inside it, for the list of topics under the section.
        let current = '';
        for (const item of section.items) {
          const topic = document.getElementById(`help-${section.id}-${item.id}`);
          if (topic && topic.getBoundingClientRect().top <= top) current = item.id;
        }
        activeTopic = current;
        keepChipInView();
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

<svelte:window on:keydown={helpKeys} />

<div class="h-full overflow-y-auto md:flex md:min-h-0 md:flex-col md:overflow-hidden" data-testid="help-view" bind:this={rootEl} on:scroll={trackSection}>
  <div class="border-b border-[var(--border-subtle)] px-4 pb-4 pt-4 sm:pt-6 md:shrink-0 lg:px-12 lg:pt-8">
    <div class="mx-auto max-w-5xl">
      <h1 class="font-serif text-3xl tracking-tight">{$localizedText.help.title}</h1>
      <p class="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.help.subtitle}</p>
      <SearchField class="mt-5" bind:value={query} bind:inputEl={searchField} testid="help-search" placeholder={$localizedText.help.searchPlaceholder} />
    </div>
  </div>

  <!-- On a phone the sections sit in one scrolling row under the search: there is no side list there. -->
  <nav class="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-2 md:hidden" bind:this={chipsEl} aria-label={$localizedText.help.sections} data-testid="help-chips">
    {#each sections as section (section.id)}
      <FilterChip
        active={activeSection === section.id && !query}
        data-testid="help-chip"
        aria-current={activeSection === section.id && !query ? 'true' : undefined}
        on:click={() => go(section.id)}
        class="min-h-10 shrink-0 whitespace-nowrap"
      >{section.title}</FilterChip>
    {/each}
</nav>

  <div class="px-4 py-6 md:min-h-0 md:flex-1 md:overflow-y-auto lg:px-12" bind:this={scroller} on:scroll={trackSection}>
    <div class="mx-auto flex max-w-5xl gap-10">
      <!-- Sections, in view while reading; hidden on a phone, where the search does the finding. -->
      <nav class="sticky top-6 hidden max-h-[calc(100vh-14rem)] w-56 shrink-0 self-start overflow-y-auto md:block" aria-label={$localizedText.help.sections}>
        <ul class="space-y-0.5">
          {#each sections as section (section.id)}
            <li>
              <Button
                variant="ghost"
                size="sm"
                data-testid="help-section"
                aria-current={activeSection === section.id && !query ? 'true' : undefined}
                on:click={() => go(section.id)}
                class="w-full justify-start normal-case {activeSection === section.id && !query ? 'bg-surface text-ink' : ''}"
              >{section.title}</Button>
              {#if activeSection === section.id && !query}
                <ul class="mb-2 ml-2 mt-0.5 space-y-0.5 border-l border-[var(--border-subtle)] pl-2" data-testid="help-topics">
                  {#each section.items as item (item.id)}
                    <li>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="help-topic"
                        aria-current={activeTopic === item.id ? 'true' : undefined}
                        on:click={() => go(section.id, item.id)}
                        class="w-full justify-start truncate normal-case {activeTopic === item.id ? 'font-bold text-ink' : ''}"
                        title={item.title}
                      >{item.title}</Button>
                    </li>
                  {/each}
                </ul>
              {/if}
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
                  <Button variant="outline" size="md" class="w-full flex-col items-start justify-start gap-0 normal-case" on:click={() => go(result.sectionId, result.itemId)}>
                    <span class="block text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{result.sectionTitle}</span>
                    <span class="mt-0.5 block text-sm font-bold text-[var(--text-primary)]">{@html highlight(result.title)}</span>
                    <span class="mt-1 block text-xs leading-relaxed text-[var(--text-secondary)]">{@html highlight(result.excerpt)}</span>
                  </Button>
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
              <Button variant="ghost" size="sm" data-testid="help-top" on:click={toTop} class="mt-6">{$localizedText.help.top}</Button>
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
