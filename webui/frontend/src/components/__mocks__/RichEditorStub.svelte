<script>
  import { createEventDispatcher } from 'svelte';

  export let content = '';
  export let onUpdate = () => {};
  export let placeholder = '';
  export let notePath = '';
  export let onImageFile = null;
  export let resolveImageSrc = (src) => src;
  export let resolveImagePath = () => '';

  const dispatch = createEventDispatcher();

  let currentContent = content;

  $: if (content !== currentContent) currentContent = content;
  $: Boolean(notePath);
  $: Boolean(onImageFile);
  $: imageMatch = currentContent.match(/!\[[^\]]*]\(([^)]+)\)/);
  $: imageSource = imageMatch?.[1] || '';
  $: attachmentPath = imageSource ? (resolveImagePath(imageSource) || imageSource) : '';

  function handleInput(event) {
    currentContent = event.currentTarget.value;
    onUpdate(currentContent);
  }

  export function getMarkdown() {
    return currentContent;
  }

  export function setMarkdown(markdown) {
    currentContent = markdown || '';
  }
</script>

<div data-testid="rich-editor-stub">
  <textarea
    data-testid="rich-editor-input"
    {placeholder}
    bind:value={currentContent}
    on:input={handleInput}
  ></textarea>
  {#if attachmentPath}
    <button
      type="button"
      on:click={() => dispatch('imageClick', { path: attachmentPath, src: imageSource, alt: '' })}
    >
      <img
        src={resolveImageSrc(imageSource)}
        alt=""
        data-attachment-path={attachmentPath}
      />
    </button>
  {/if}
</div>
