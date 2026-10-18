<script>
  /**
   * The tags above the board. From sm up: the busiest few as chips (one tap narrows the board) and "N more",
   * which opens a list of every tag with its count and a search box; a chosen tag always shows as a chip.
   * On a phone there are no chips: one "Tags" button, in the row with the order and colors, opens that same
   * list, and shows the chosen tag's name while one is chosen.
   */
  import { createEventDispatcher, tick } from 'svelte';
  import { Check, ChevronDown } from 'lucide-svelte';
  import SearchField from './SearchField.svelte';
  import { boardTag, homeTags } from '../lib/dashboard.js';
  import { filterTagStats } from '../lib/tags.js';
  import { localizedText } from '../lib/strings.js';

  // Every control in the row is as tall as the order-and-colors box beside it: border 2 + padding 8 + h-7 28 = 38px.
  const CHIPS = 5;
  const dispatch = createEventDispatcher();

  let open = false;
  let filter = '';
  let inputEl = null;
  let root = null;

  // The chips never wrap: as many as fit the row's width are drawn, the rest wait behind "N more". Widths are
  // measured, not guessed, since a tag's name can be short or long; chips that do not fit stay in the page
  // invisible, so they can still be measured when the row grows.
  const GAP = 6;
  // "Ещё 25" with its arrow, 38px tall: kept free at the row's end while some tag is not a chip.
  const MORE_WIDTH = 120;
  let rowWidth = 0;
  let chipEls = {};
  let widths = {};
  let fit = CHIPS + 1;

  $: stats = $homeTags || [];
  $: chipNames = pickChips(stats, $boardTag);
  $: shown = chipNames.filter((name, index) => name === $boardTag || index < fit);
  $: moreCount = Math.max(0, stats.length - shown.filter((name) => stats.some((entry) => entry.tag === name)).length);
  $: visible = filterTagStats(stats, filter);
  $: rowWidth, chipNames, $localizedText, measure();

  function pickChips(all, chosen) {
    const names = all.slice(0, CHIPS).map((entry) => entry.tag);
    if (chosen && !names.includes(chosen)) names.push(chosen);
    return names;
  }

  async function measure() {
    await tick();
    if (!rowWidth) return;
    for (const [name, el] of Object.entries(chipEls)) {
      if (el) widths[name] = el.offsetWidth;
    }
    let free = rowWidth - (stats.length > CHIPS ? MORE_WIDTH + GAP : 0);
    const chosen = chipNames.indexOf($boardTag);
    if (chosen >= 0 && widths[$boardTag]) free -= widths[$boardTag] + GAP;
    let count = 0;
    for (const [index, name] of chipNames.entries()) {
      if (index === chosen) { count += 1; continue; }
      const width = (widths[name] || 80) + GAP;
      if (width > free) break;
      free -= width;
      count += 1;
    }
    if (count !== fit) fit = count;
  }

  function choose(tag) {
    dispatch('choose', $boardTag === tag ? '' : tag);
  }

  function pick(tag) {
    close();
    dispatch('choose', tag);
  }

  async function toggle() {
    open = !open;
    filter = '';
    if (open) {
      await tick();
      inputEl?.focus();
    }
  }

  function close() {
    open = false;
  }

  function onWindowClick(event) {
    if (open && root && !root.contains(event.target)) close();
  }

  function onKeydown(event) {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }
</script>

<svelte:window on:click={onWindowClick} on:keydown={onKeydown} />

{#if chipNames.length > 0}
  <div class="flex min-w-0 items-center gap-1.5 sm:flex-1" bind:clientWidth={rowWidth} role="group" aria-label={$localizedText.app.board.tagsLabel} data-testid="board-tags">
    <!-- Chips only from sm up, in one row. -->
    <div class="relative hidden min-w-0 items-center gap-1.5 overflow-hidden sm:flex">
      {#each chipNames as tag, index (tag)}
        <button
          type="button"
          bind:this={chipEls[tag]}
          class="{shown.includes(tag) ? '' : 'invisible absolute left-0 top-0'} h-[38px] max-w-[12rem] shrink-0 truncate rounded-ui border px-2.5 text-[length:var(--text-whisper-lg)] leading-tight transition {$boardTag === tag ? 'border-[var(--text-primary)] bg-[var(--bg-secondary)] font-bold text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
          aria-pressed={$boardTag === tag}
          on:click={() => choose(tag)}
        >
          {tag}
        </button>
      {/each}
    </div>
    {#if stats.length > 0}
      <div class="relative shrink-0 {moreCount > 0 ? '' : 'sm:hidden'}" bind:this={root}>
        <button
          type="button"
          class="inline-flex max-w-[8rem] items-center gap-1 rounded-ui border px-2.5 text-[length:var(--text-whisper-lg)] leading-tight transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] h-[38px] sm:max-w-none sm:px-2.5 {$boardTag ? 'border-[var(--text-primary)] bg-[var(--bg-secondary)] font-bold text-[var(--text-primary)] sm:border-dashed sm:border-[var(--border-subtle)] sm:bg-transparent sm:font-normal sm:text-[var(--text-secondary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] sm:border-dashed'}"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="board-tags-more"
          on:click={toggle}
        >
          <span class="min-w-0 truncate sm:hidden">{$boardTag || $localizedText.app.board.tagsLabel}</span>
          <span class="hidden sm:inline">{$localizedText.app.board.moreTags(moreCount)}</span>
          <ChevronDown size="12" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />
        </button>
        {#if open}
          <div
            class="absolute left-0 top-full z-40 mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2 shadow-lg shadow-black/10"
            data-testid="board-tags-menu"
            role="dialog"
            aria-label={$localizedText.app.board.tagsLabel}
          >
            <SearchField
              testid="board-tags-filter"
              placeholder={$localizedText.tags.filter}
              bind:value={filter}
              bind:inputEl
            />
            <ul class="mt-2 max-h-72 overflow-y-auto">
              {#each visible as entry (entry.tag)}
                <li>
                  <button
                    type="button"
                    data-testid="board-tag-option"
                    aria-pressed={$boardTag === entry.tag}
                    class="flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-xs transition hover:bg-[var(--bg-secondary)] {$boardTag === entry.tag ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
                    on:click={() => pick($boardTag === entry.tag ? '' : entry.tag)}
                  >
                    <span class="min-w-0 flex-1 truncate">{entry.tag}</span>
                    {#if $boardTag === entry.tag}<Check size="12" strokeWidth="1.7" aria-hidden="true" />{/if}
                    <span class="tabular-nums text-[var(--text-tertiary)]">{entry.count}</span>
                  </button>
                </li>
              {:else}
                <li class="px-2 py-3 text-center text-xs text-[var(--text-tertiary)]">{$localizedText.tags.emptyFiltered}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
