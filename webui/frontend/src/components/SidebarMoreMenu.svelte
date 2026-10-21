<script>
  /**
   * Everything that is not a place of its own: the map, favourites, tags, attachments, the notes table, saved
   * searches, templates, and the trash at the very end. It sits first in the sidebar's foot, so the foot
   * itself keeps three rows (Other, Terminal, Settings) on a phone as well as on a desktop.
   */
  import { createEventDispatcher, tick } from 'svelte';
  import { Icon } from '../lib/tree-icons.js';
  import { localizedText } from '../lib/strings.js';

  export let mobile = false;
  export let showTagsLink = false;
  export let showPropertiesLink = false;
  export let showSavedSearchesLink = false;

  const dispatch = createEventDispatcher();
  let open = false;
  let anchor;
  let menuEl;

  const itemClass = `flex w-full items-center gap-2.5 px-3 text-left text-sm outline-none transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--bg-secondary)] focus-visible:text-[var(--text-primary)] ${mobile ? 'min-h-11' : 'h-8'}`;

  async function toggle() {
    open = !open;
    if (!open) return;
    await tick();
    // The menu takes the focus itself, so Escape closes it before Tab walks its items.
    menuEl?.focus();
  }

  function pick(action) {
    open = false;
    dispatch(action);
    // The phone opens the chosen place over the sidebar, so the sidebar steps aside after the action is on
    // its way; closing first could take the menu, and the action with it, out of the page.
    if (mobile) dispatch('picked');
  }

  function closeOutside(event) {
    if (open && anchor && !anchor.contains(event.target)) open = false;
  }

  function onMenuKeydown(event) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    open = false;
    anchor?.querySelector('button')?.focus();
  }
</script>

<svelte:window on:pointerdown={closeOutside} />

<div class="relative" bind:this={anchor}>
  <button
    type="button"
    data-testid="open-more"
    aria-haspopup="menu"
    aria-expanded={open}
    on:click={toggle}
    class="{mobile
      ? 'flex min-h-11 w-full items-center gap-4 px-2 text-left text-sm text-[var(--text-primary)] transition hover:opacity-70'
      : 'flex h-7 w-full items-center gap-2 rounded-ui px-2 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'} {open ? 'text-[var(--text-primary)]' : ''}"
  >
    <Icon.LayoutGrid size={mobile ? 20 : 16} strokeWidth="1.7" class="shrink-0" aria-hidden="true" />
    <span class="truncate">{$localizedText.sidebar.more}</span>
    <Icon.ChevronRight size={mobile ? 16 : 14} strokeWidth="1.7" class="ml-auto shrink-0 transition-transform {open ? '-rotate-90' : ''}" aria-hidden="true" />
  </button>

  {#if open}
    <div
      bind:this={menuEl}
      role="menu"
      tabindex="-1"
      aria-label={$localizedText.sidebar.more}
      data-testid="more-menu"
      on:keydown={onMenuKeydown}
      class="absolute bottom-full left-0 z-40 mb-1 max-h-[min(24rem,calc(100dvh-10rem))] w-full overflow-y-auto rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1 normal-case tracking-normal shadow-2xl"
    >
      <button type="button" role="menuitem" data-testid="open-map" class={itemClass} on:click={() => pick('openMap')}>
        <Icon.Waypoints size="16" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />{$localizedText.map.sidebar}
      </button>
      <button type="button" role="menuitem" data-testid="open-favorites" class={itemClass} on:click={() => pick('openFavorites')}>
        <Icon.Star size="16" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />{$localizedText.favorites.sidebar}
      </button>
      {#if showTagsLink}
        <button type="button" role="menuitem" data-testid="open-tags" class={itemClass} on:click={() => pick('openTags')}>
          <Icon.Hash size="16" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />{$localizedText.tags.title}
        </button>
      {/if}
      <button type="button" role="menuitem" data-testid="open-attachments" class={itemClass} on:click={() => pick('openAttachments')}>
        <Icon.Paperclip size="16" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />{$localizedText.attachments.sidebar}
      </button>
      {#if showPropertiesLink}
        <button type="button" role="menuitem" data-testid="open-properties" class={itemClass} on:click={() => pick('openProperties')}>
          <Icon.SlidersHorizontal size="16" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />{$localizedText.properties.sidebar}
        </button>
      {/if}
      {#if showSavedSearchesLink}
        <button type="button" role="menuitem" data-testid="open-saved-searches" class={itemClass} on:click={() => pick('openSavedSearches')}>
          <Icon.Bookmark size="16" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />{$localizedText.savedSearches.title}
        </button>
      {/if}
      <button type="button" role="menuitem" data-testid="open-templates" class={itemClass} on:click={() => pick('openTemplatesManager')}>
        <Icon.LayoutTemplate size="16" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />{$localizedText.sidebar.templates}
      </button>
      <div class="my-1 h-px bg-[var(--border-subtle)]" aria-hidden="true"></div>
      <!-- Destructive, and away from the tools opened every day. -->
      <button type="button" role="menuitem" data-testid="open-trash" class="{itemClass} text-[var(--red)] hover:!bg-[color-mix(in_srgb,var(--red)_10%,transparent)] hover:!text-[var(--red)]" on:click={() => pick('openTrash')}>
        <Icon.Trash2 size="16" strokeWidth="1.7" class="shrink-0" aria-hidden="true" />{$localizedText.sidebar.trash}
      </button>
    </div>
  {/if}
</div>
