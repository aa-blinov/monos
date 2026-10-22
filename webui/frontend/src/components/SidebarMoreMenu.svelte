<script>
  /**
   * Everything that is not a place of its own: the map, favourites, tags, attachments, the notes table, saved
   * searches, templates, and the trash at the very end. It sits first in the sidebar's foot, so the foot
   * itself keeps three rows (Other, Terminal, Settings) on a phone as well as on a desktop.
   */
  import { createEventDispatcher } from 'svelte';
  import { Icon } from '../lib/tree-icons.js';
  import { localizedText } from '../lib/strings.js';
  import { Menu, SidebarItem } from '@monos/ui';

  export let mobile = false;
  export let showTagsLink = false;
  export let showPropertiesLink = false;
  export let showSavedSearchesLink = false;

  const dispatch = createEventDispatcher();

  $: items = [
    { value: 'openMap', label: $localizedText.map.sidebar, icon: Icon.Waypoints, testid: 'open-map' },
    { value: 'openFavorites', label: $localizedText.favorites.sidebar, icon: Icon.Star, testid: 'open-favorites' },
    showTagsLink
      ? { value: 'openTags', label: $localizedText.tags.title, icon: Icon.Hash, testid: 'open-tags' }
      : null,
    {
      value: 'openAttachments',
      label: $localizedText.attachments.sidebar,
      icon: Icon.Paperclip,
      testid: 'open-attachments',
    },
    showPropertiesLink
      ? { value: 'openProperties', label: $localizedText.properties.sidebar, icon: Icon.SlidersHorizontal, testid: 'open-properties' }
      : null,
    showSavedSearchesLink
      ? { value: 'openSavedSearches', label: $localizedText.savedSearches.title, icon: Icon.Bookmark, testid: 'open-saved-searches' }
      : null,
    { value: 'openTemplatesManager', label: $localizedText.sidebar.templates, icon: Icon.LayoutTemplate, testid: 'open-templates' },
    { separator: true },
    { value: 'openTrash', label: $localizedText.sidebar.trash, icon: Icon.Trash2, testid: 'open-trash', danger: true },
  ].filter(Boolean);

  function pick(action) {
    dispatch(action);
    // The phone opens the chosen place over the sidebar, so the sidebar steps aside after the action is on
    // its way; closing first could take the menu, and the action with it, out of the page.
    if (mobile) dispatch('picked');
  }
</script>

<Menu
  {items}
  label={$localizedText.sidebar.more}
  placement="top"
  width="trigger"
  menuTestid="more-menu"
  class="w-full"
  on:select={(event) => pick(event.detail.value)}
>
  <svelte:fragment slot="trigger" let:open let:toggle let:triggerProps>
    <SidebarItem
      {...triggerProps}
      data-testid="open-more"
      active={open}
      on:click={toggle}
      class={mobile ? 'min-h-11 gap-4' : ''}
    >
      <svelte:fragment slot="icon">
        <Icon.LayoutGrid size={mobile ? 20 : 16} strokeWidth="1.7" class="shrink-0" aria-hidden="true" />
      </svelte:fragment>
      <span class="truncate">{$localizedText.sidebar.more}</span>
      <svelte:fragment slot="trailing">
        <Icon.ChevronRight
          size={mobile ? 16 : 14}
          strokeWidth="1.7"
          class="shrink-0 transition-transform {open ? '-rotate-90' : ''}"
          aria-hidden="true"
        />
      </svelte:fragment>
    </SidebarItem>
  </svelte:fragment>
</Menu>
