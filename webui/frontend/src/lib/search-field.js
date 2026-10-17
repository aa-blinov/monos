/**
 * The look of every search box in the app, taken from the board's search in the header: the same height,
 * background, border, type and magnifier, so a search reads as a search wherever it is.
 */

// The height (h-11 lg:h-10) is written beside each input, where the field-geometry test reads it.
export const SEARCH_INPUT_CLASS = 'w-full rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)] pl-10 text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-secondary)] focus:border-[var(--text-primary)]';

export const SEARCH_ICON_CLASS = 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]';

export const SEARCH_CLEAR_CLASS = 'absolute top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-tertiary)_35%,transparent)] hover:text-[var(--text-primary)]';
