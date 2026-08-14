<script>
  /**
   * Custom-styled checkbox that matches the gruvbox theme.
   * - Native <input type="checkbox"> is hidden visually but kept for a11y
   *   and form integration (bind:checked, on:change).
   * - A sibling <span> renders the visible box and a checkmark svg.
   */
  export let id = '';
  export let checked = false;
  export let disabled = false;
</script>

<label
  class="group inline-flex items-center gap-2.5 select-none cursor-pointer {disabled ? 'cursor-not-allowed opacity-50' : ''}"
>
  <span class="relative inline-flex w-4 h-4 items-center justify-center">
    <input
      type="checkbox"
      {id}
      bind:checked
      on:change
      on:input
      {disabled}
      data-testid="checkbox-input"
      class="peer absolute inset-0 m-0 w-full h-full appearance-none cursor-pointer
             border border-[var(--border-subtle)] bg-[var(--bg-primary)]
             checked:border-[var(--text-primary)] checked:bg-[var(--text-primary)]
             group-hover:border-[var(--text-secondary)]
             focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--text-primary)]
             transition-colors duration-150"
    />
    <svg
      data-testid="checkbox-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="pointer-events-none absolute inset-0 m-auto w-3 h-3 z-10
             text-[var(--bg-primary)] opacity-0 peer-checked:opacity-100
             transition-opacity duration-150"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  </span>
  <span class="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
    <slot />
  </span>
</label>
