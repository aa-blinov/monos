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
  // A dialog that fixes its own height (`h-[88vh]`) and lays out columns that scroll by themselves. The kit's panel
  // always scrolls as a whole and wraps its content in a block that takes the height of the content, so without this
  // the columns grow past the window and the buttons leave the screen. Here the panel clips, and that block is a
  // flex column that takes the room left under the title.
  export let fill = false;

  const FILL = '!overflow-hidden flex flex-col [&>.mt-4]:flex [&>.mt-4]:min-h-0 [&>.mt-4]:flex-1 [&>.mt-4]:flex-col';
  $: panelClass = fill ? `${widthClass} ${FILL}` : widthClass;

  const dispatch = createEventDispatcher();
</script>

<KitModal
  open={true}
  {title}
  description={subtitle}
  widthClass={panelClass}
  {closeOnEscape}
  closeLabel={$localizedText.modal.close}
  titleClass="break-words font-serif text-2xl leading-tight tracking-tight"
  descriptionClass="mb-5 text-sm leading-relaxed text-[var(--text-secondary)]"
  on:close={() => dispatch('close')}
>
  <slot />
</KitModal>
