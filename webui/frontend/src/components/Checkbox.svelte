<script>
  import { Checkbox as KitCheckbox } from '@monos/ui';

  export let id = '';
  export let checked = false;
  export let disabled = false;

  let className = '';
  export { className as class };
</script>

<KitCheckbox {id} bind:checked {disabled} class={className} on:change>
  <slot />
</KitCheckbox>
