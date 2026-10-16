<script>
  import { createEventDispatcher } from 'svelte';
  import { canonicalCategory, filterCategories } from '../lib/categories.js';

  /** The category stored for the note. Updated when the user commits a value. */
  export let value = '';
  /** Categories already used in the vault, `{ name, count }`, most used first. */
  export let suggestions = [];
  export let placeholder = '';
  export let label = '';
  export let listLabel = '';
  export let testid = '';

  const dispatch = createEventDispatcher();
  const listId = `category-list-${Math.random().toString(36).slice(2, 8)}`;
  const optionId = (index) => `${listId}-${index}`;

  let text = value;
  let focused = false;
  let open = false;
  let activeIndex = -1;
  // Что пользователь напечатал после фокуса. null — ещё ничего не печатал,
  // и список показывает все категории, даже если в поле уже стоит значение.
  let query = null;

  // Пока поле не в фокусе, показываем сохранённое значение, а не черновик.
  $: if (!focused) text = value;
  $: options = filterCategories(suggestions, query ?? '');
  $: showList = open && options.length > 0;

  /** Store the typed value in its canonical spelling, and only if it changed. */
  function commitText() {
    const next = canonicalCategory(text, suggestions);
    text = next;
    if (next !== value) {
      value = next;
      dispatch('commit', next);
    }
  }

  function choose(item) {
    text = item.name;
    open = false;
    activeIndex = -1;
    query = null;
    commitText();
  }

  function handleFocus() {
    focused = true;
    open = true;
    activeIndex = -1;
    query = null;
    dispatch('open');
  }

  function handleBlur() {
    focused = false;
    open = false;
    activeIndex = -1;
    query = null;
    commitText();
  }

  function handleInput(event) {
    open = true;
    activeIndex = -1;
    query = event.currentTarget.value;
  }

  function handleKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open = true;
      if (options.length) activeIndex = (activeIndex + 1) % options.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      open = true;
      if (options.length) activeIndex = activeIndex <= 0 ? options.length - 1 : activeIndex - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (showList && activeIndex >= 0) choose(options[activeIndex]);
      else {
        open = false;
        commitText();
      }
    } else if (event.key === 'Escape') {
      if (showList) {
        // Первый Escape закрывает список, а не окно целиком.
        event.stopPropagation();
        open = false;
        activeIndex = -1;
      } else {
        text = value;
        query = null;
      }
    }
  }
</script>

<div class="relative">
  <input
    type="text"
    role="combobox"
    aria-label={label}
    aria-autocomplete="list"
    aria-expanded={showList}
    aria-controls={listId}
    aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
    data-testid={testid}
    bind:value={text}
    {placeholder}
    on:focus={handleFocus}
    on:blur={handleBlur}
    on:input={handleInput}
    on:keydown={handleKeydown}
    class="h-8 w-full rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
  />
  {#if showList}
    <!-- The list is part of the panel it sits in, not a second popup over it: the panel opens upward from
         the bottom bar, so a list hanging below it would cover the bar. -->
    <ul
      id={listId}
      role="listbox"
      aria-label={listLabel}
      class="mt-1 max-h-48 w-full overflow-y-auto rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1"
    >
      {#each options as item, index (item.name)}
        <li
          id={optionId(index)}
          role="option"
          aria-selected={index === activeIndex}
          class="flex min-h-9 cursor-pointer items-center justify-between gap-6 px-2.5 text-xs lg:min-h-0 lg:py-1.5 {index === activeIndex
            ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
          on:mousedown|preventDefault={() => choose(item)}
          on:mouseenter={() => { activeIndex = index; }}
        >
          <span class="truncate">{item.name}</span>
          {#if item.count}<span class="tabular-nums text-[var(--text-tertiary)]">{item.count}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
