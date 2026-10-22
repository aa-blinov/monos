<script>
  /**
   * The app's search box: the kit's SearchField with Monos's event shape and
   * the app's `inputEl` binding. `trailing` is the product's own action inside
   * the field, such as Save search.
   */
  import { createEventDispatcher } from 'svelte';
  import { SearchField as KitSearchField } from '@monos/ui';
  import { localizedText } from '../lib/strings.js';

  export let value = '';
  export let placeholder = '';
  export let label = placeholder;
  export let testid = undefined;
  export let id = undefined;
  export let inputEl = null;

  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher();

  function onInput(event) {
    value = event.detail?.currentTarget?.value ?? value;
    dispatch('input', value);
  }

  function onClear() {
    value = '';
    dispatch('input', value);
    dispatch('clear');
    inputEl?.focus();
  }
</script>

<KitSearchField
  bind:value
  bind:inputEl
  {placeholder}
  {label}
  {id}
  data-testid={testid}
  clearLabel={$localizedText.header.closeSearch}
  class={className}
  on:input={onInput}
  on:clear={onClear}
  on:keydown
  on:focus
  {...$$restProps}
>
  <svelte:fragment slot="trailing">
    {#if $$slots.trailing}<slot name="trailing" />{/if}
  </svelte:fragment>
</KitSearchField>
