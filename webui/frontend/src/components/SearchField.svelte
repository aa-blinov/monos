<script>
  /**
   * The app's one search box, as on the board: a magnifier inside on the left, the secondary background, the
   * border darkening on focus, × to clear. The header's search uses the same classes (lib/search-field.js).
   */
  import { createEventDispatcher } from 'svelte';
  import { Search, X } from 'lucide-svelte';
  import { localizedText } from '../lib/strings.js';
  import { SEARCH_CLEAR_CLASS, SEARCH_ICON_CLASS, SEARCH_INPUT_CLASS } from '../lib/search-field.js';

  export let value = '';
  export let placeholder = '';
  export let label = placeholder;
  export let testid = undefined;
  export let id = undefined;
  export let inputEl = null;

  const dispatch = createEventDispatcher();

  function clear() {
    value = '';
    dispatch('input', value);
    dispatch('clear');
    inputEl?.focus();
  }
</script>

<div class="relative min-w-0 {$$props.class || ''}">
  <Search size="16" strokeWidth="1.7" class={SEARCH_ICON_CLASS} aria-hidden="true" />
  <input
    bind:this={inputEl}
    bind:value
    {id}
    type="text"
    role="searchbox"
    {placeholder}
    aria-label={label}
    data-testid={testid}
    autocomplete="off"
    spellcheck="false"
    class="h-11 lg:h-10 {SEARCH_INPUT_CLASS} {value ? 'pr-12' : 'pr-3'}"
    on:input={() => dispatch('input', value)}
    on:keydown={(event) => { if (event.key === 'Escape' && value) { event.stopPropagation(); clear(); } }}
    on:keydown
    on:focus
  />
  {#if value}
    <button type="button" class="{SEARCH_CLEAR_CLASS} right-1.5" aria-label={$localizedText.header.closeSearch} on:click={clear}>
      <X class="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  {/if}
</div>
