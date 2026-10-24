// One look for every menu the app draws itself (the sidebar and card context menus, the terminal's, the editor's
// view and "more tools" menus). The kit's `Menu` already looks like this; these constants give the menus that sit at
// the pointer or in the editor the same panel, the same rows and the same left edge, so a person meets one menu
// whichever way it opened. Rows are sentence case and left aligned; a destructive row is the only coloured one.

export const menuPanelClass = 'rounded-ui border border-line bg-canvas p-1 shadow-overlay outline-none';

// `!` on the few utilities the kit button would otherwise win: padding, weight, letter spacing and min height are its
// own (Tailwind orders `tracking-widest` after `tracking-normal`, so the variant's own value never wins). `!min-h-8`
// would also beat the kit's phone rule, so a row is 44px again under `max-sm`.
export const menuItemClass =
  'w-full !min-h-8 max-sm:!min-h-11 justify-start gap-2.5 !px-3 text-sm !font-normal !tracking-normal text-ink-soft hover:bg-surface hover:text-ink focus-visible:bg-surface focus-visible:text-ink';

export const menuDangerClass =
  '!text-danger-text hover:!text-danger-text hover:bg-[color-mix(in_srgb,var(--ui-danger)_10%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--ui-danger)_10%,transparent)]';

export const menuSeparatorClass = 'my-1 h-px bg-line';
