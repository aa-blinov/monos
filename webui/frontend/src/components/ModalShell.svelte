<script>
  /**
   * The app's dialog shell, now the kit's Modal. The kit owns the stacked-dialog
   * queue, focus, scroll lock and the close button; Monos keeps its title face,
   * widths and the `close` event the product already listens for.
   */
  import { createEventDispatcher } from 'svelte';
  import { Modal as KitModal } from '@monos/ui';
  import { localizedText } from '../lib/strings.js';

  export let title = '';
  export let subtitle = '';
  export let widthClass = 'w-96';
  export let closeOnEscape = true;

  const dispatch = createEventDispatcher();
</script>

<KitModal
  open={true}
  {title}
  description={subtitle}
  {widthClass}
  {closeOnEscape}
  closeLabel={$localizedText.modal.close}
  titleClass="break-words font-serif text-2xl leading-tight tracking-tight"
  descriptionClass="mb-5 text-sm leading-relaxed text-[var(--text-secondary)]"
  on:close={() => dispatch('close')}
>
  <slot />
</KitModal>
