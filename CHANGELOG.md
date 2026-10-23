# Changelog

All notable changes to monos. Versions are ordered newest first.

<!--
  The format is Keep a Changelog. Each entry says what changed and why it
  was worth changing.

  The traps do not go here. They go in AGENTS.md, because the changelog is
  read by the people who use the software and the traps are read by whoever
  works on the code next.
-->

## [Unreleased]

### Added

- Nothing yet.

## 1.16.15 — 2026-10-22

### Changed

- The due-date clear control is the kit's `IconButton`, and related-note rows
  are the kit's `Button`.
- Site screenshots were taken again.

## 1.16.14 — 2026-10-22

### Changed

- The board's tag chips, "all tags" trigger and tag options use the kit's
  `FilterChip` and `Button`.
- `@monos/ui` is `1.1.19`: `FilterChip` keeps its slot on one line.
- Site screenshots were taken again.

## 1.16.13 — 2026-10-22

### Changed

- The note-colour panel's "no colour" and swatches use the kit's `Button` and
  `IconButton`; the colour is still written to the note.
- Site screenshots were taken again.

## 1.16.12 — 2026-10-22

### Changed

- The note title is the kit's `FieldControl` in `bare` mode; Enter, blur,
  readonly-on-conflict and the title commit path stay.
- `@monos/ui` is `1.1.17`: `FieldControl` takes `bare`.
- Site screenshots were taken again.

## 1.16.11 — 2026-10-22

### Changed

- The notes table's column toggles, "more columns" and filter suggestions are
  the kit's `Button`.
- Site screenshots were taken again.

## 1.16.10 — 2026-10-22

### Changed

- The note-properties panel uses the kit's `FieldControl` for values and types,
  `IconButton` for removal and `Button` for adding a property.
- Site screenshots were taken again.

## 1.16.9 — 2026-10-22

### Changed

- The editor's related-notes trigger, "show on map" and "link mention"
  actions are the kit's `Button`; the trigger still returns focus to the panel.
- Site screenshots were taken again.

## 1.16.8 — 2026-10-22

### Changed

- The export formats in the editor's Export panel are the kit's `Button`.
- Site screenshots were taken again.

## 1.16.7 — 2026-10-22

### Changed

- The due-date quick picks and the calendar button in the editor are the kit's
  `Button`.
- Site screenshots were taken again.

## 1.16.6 — 2026-10-22

### Changed

- The notes table's inline cell editor is the kit's `FieldControl`; focus,
  select-all, Enter to save, Escape to cancel and the write error stay.
- Site screenshots were taken again.

## 1.16.5 — 2026-10-22

### Changed

- The outline's phone close button is the kit's `IconButton`; focus return and
  the `lg` visibility stay the same.
- Site screenshots were taken again.

## 1.16.4 — 2026-10-22

### Changed

- The lock panel's passphrase fields are the kit's `FieldControl`, and its
  lock, relock and remove actions are the kit's `Button`.
- Site screenshots were taken again.

## 1.16.3 — 2026-10-22

### Changed

- Settings' print, export, import, attachments and git-reset actions are the
  kit's `Button`.
- Site screenshots were taken again.

## 1.16.2 — 2026-10-22

### Changed

- The board's order menu is the kit's `Menu`; its checked item is a
  `menuitemradio` with a check mark.
- `@monos/ui` is `1.1.15`: `Menu` items take `checked`.
- Site screenshots were taken again.

## 1.16.1 — 2026-10-22

### Changed

- The notes table's column search is the kit's `SearchField`.
- Site screenshots were taken again.

## 1.16.0 — 2026-10-22

### Changed

- The terminal's find bar uses the kit's `SearchField` and `IconButton`; the
  previous, next and close actions keep their labels.
- `@monos/ui` is `1.1.14`: `SearchField` takes `clearable`.
- Site screenshots were taken again.

## 1.15.9 — 2026-10-22

### Changed

- The terminal's shell tabs are the kit's `Tabs` in `bare` mode with `closable`;
  `terminal-tab` and `terminal-tab-close` hooks survive.
- `@monos/ui` is `1.1.13`: `Tabs` takes `closable`, `closeLabel` and a `bare`
  variant; items take `testid`, `closeTestid` and `class`.
- Site screenshots were taken again.

## 1.15.8 — 2026-10-22

### Changed

- Settings' git repository and branch selects are the kit's `FieldControl`;
  every select in Settings now uses the kit field.
- Site screenshots were taken again.

## 1.15.7 — 2026-10-22

### Changed

- Settings' appearance selects — language, font, sizes, tabs, content width and
  line height — are the kit's `FieldControl`.
- `@monos/ui` is `1.1.12`: `FieldControl` keeps its value in step on `change`,
  so a bound store updates before its change handler runs.
- Site screenshots were taken again.

## 1.15.6 — 2026-10-22

### Changed

- Settings' token, owner, device name, auto-sync interval and commit message
  are the kit's `FieldControl`.
- The tag panel's rename field is the kit's `FieldControl`.
- Site screenshots were taken again.

## 1.15.5 — 2026-10-22

### Changed

- The command palette's search is the kit's `SearchField`, with the same
  combobox semantics and a native key path for arrows and Enter.
- `@monos/ui` is `1.1.11`: `SearchField` takes `clearOnEscape`, so the palette
  closes instead of clearing its query.
- Site screenshots were taken again.

## 1.15.4 — 2026-10-22

### Changed

- The editor's `⋯` menu is the kit's `Menu`; pin, favourite, terminal, agent,
  lock, focus, raw mode, colour and trash keep their rows and test hooks.
- `@monos/ui` is `1.1.10`: `Menu` takes a bindable `open`, and items take
  `iconProps` and `class`.
- Site screenshots were taken again.

## 1.15.3 — 2026-10-22

### Changed

- The terminal's `⋯` menu is the kit's `Menu`; search, restart and the agent
  rules keep their actions and test hooks.
- Site screenshots were taken again.

## 1.15.2 — 2026-10-22

### Changed

- The sidebar's "Other" menu is the kit's `Menu`; its links, separators, danger
  item and `open-*` test hooks survive.
- `@monos/ui` is `1.1.9`: `Menu` items take `href` and `testid`, and the list
  takes `menuTestid`.
- Site screenshots were taken again.

## 1.15.1 — 2026-10-22

### Changed

- Settings' theme mode is the kit's `SegmentedControl`.
- The focus-mode exit is the kit's `Button`.
- Site screenshots were taken again.

## 1.15.0 — 2026-10-22

### Changed

- The pinned section is the kit's `SidebarSection`; its rows are `SidebarItem`.
  The collapse hook, the `pinned-toggle` and `pinned-list` hooks and the drag
  payload survive.
- The board card is the kit's `Card` in `bare` mode; the tint, proportional
  serif and hover lift stay in `NoteCard`.
- `@monos/ui` is `1.1.8`.
- Site screenshots were taken again.

## 1.14.0 — 2026-10-22

### Changed

- The outer sidebar is the kit's `Sidebar`, with `scroll={false}` and
  `bordered={false}` because Monos owns the scroll and the resize border. Its
  background right-click menu still opens; a row's own menu wins.
- `@monos/ui` is `1.1.5`: `Sidebar` takes `scroll` and `bordered` and forwards
  the body's `contextmenu`.
- Site screenshots were taken again.

## 1.13.0 — 2026-10-22

### Changed

- The sidebar foot — Other, Terminal and Settings — is made of the kit's
  `SidebarItem`; the Other trigger too. The three rows keep their order, their
  `aria-pressed` state and their menu.
- `@monos/ui` is `1.1.4`.
- Site screenshots were taken again.

## 1.12.0 — 2026-10-22

### Changed

- The note tree rows are the kit's `SidebarItem`. Drag-and-drop, the context
  menu, keyboard menu, selected colours and the `aria-current` marker survive.
- `@monos/ui` is `1.1.4`: `SidebarItem` takes `style` and forwards drag,
  context-menu and keyboard events.
- Site screenshots were taken again.

## 1.11.0 — 2026-10-22

### Changed

- The note's tag panel is the kit's `TagInput`. Tags keep their `#` prefix,
  "Remove tag alpha" labels, the draft-is-accepted-on-close behaviour and the
  same `property-tags` and `tag-suggestions` test hooks.
- `@monos/ui` is `1.1.3`: `TagInput` takes `ariaLabel`, `testid`,
  `suggestionsTestid`, `prefix`, `commitOnBlur` and a per-tag `removeLabel`.
- Site screenshots were taken again.

## 1.10.1 — 2026-10-22

### Fixed

- The header search and the icon buttons beside it now share one height:
  36px on a desktop and 44px on a phone, from the kit's `sm`/`md`/`lg` scale.
- `@monos/ui` is `1.1.1`: `Select` `sm`, `SearchField` `md` and
  `SegmentedControl` no longer disagree with the rest of the controls.
- Site screenshots were taken again.

## 1.10.0 — 2026-10-22

### Changed

- `@monos/ui` is now `1.0.7`. Its field contract is available as
  `FieldControl` and `@monos/ui/field`.
- `formFieldClass()` delegates to `fieldControlClass()`: every native input,
  select and textarea in Monos now uses the kit's height, underline, leading
  and focus, while the labels and product behaviour stay in their components.
- The field geometry is now 44px on a phone, from the kit's touch rule.
- Site screenshots were taken again.

## 1.9.0 — 2026-10-22

### Changed

- `@monos/ui` is now `1.0.5`. Its `Modal` keeps a stack of dialogs, preserves
  focus in a child control that autofocuses, returns focus on destroy and takes
  host `widthClass`, `titleClass` and `descriptionClass`.
- `ModalShell` is the kit's `Modal`; the app keeps its title face, its widths
  and its `close` event. Nested dialogs answer Escape one at a time.
- Site screenshots were taken again.

## 1.8.0 — 2026-10-22

### Changed

- `@monos/ui` is now `1.0.4`. Its `IconButton` gained a `bare` mode and its
  `SearchField` gained `inputEl` and a `trailing` slot.
- `TooltipIconButton` is the kit's `IconButton` in bare mode; all 49 icon
  buttons now use the kit primitive while Monos keeps its tooltip placement.
- `SearchField` is the kit's `SearchField`; the header uses the same component,
  with the Save-search action in its trailing slot. The app's `inputEl` binding
  and string `input` event are preserved.
- Site screenshots were taken again.

## 1.7.1 — 2026-10-22

### Fixed

- Express 5 no longer accepts a bare `*` route. The SPA fallback now uses a
  regular expression; without it the desktop app failed at boot with
  "Missing parameter name at index 1: *" and no window opened.
- The full acceptance run now passes on the dev app: 23 of 23 steps, including
  a clean install, a real note, the native menus, the terminal, a phone-sized
  window and a restart.

## 1.7.0 — 2026-10-22

### Changed

- The palette is now read from the kit's `themes.css`; `applyTheme()` sets
  `data-theme` and `data-mode`, and Monos's older variables are aliases of the
  `--ui-*` roles. Every screen, including the editor and terminal surfaces, now
  reads the kit palette.
- `Checkbox` is the kit's checkbox; the app keeps its props and change event.
- The page keeps `color-scheme: normal`: the kit themes set it at the root, but
  a page-wide scheme changed caret placement in the editor, so form controls
  keep their own mode.
- Site screenshots were taken again from the current app.

## 1.6.0 — 2026-10-22

### Added

- The UI token layer now comes from [`@monos/ui`](https://github.com/aa-blinov/monos-ui)
  `1.0.3`: its `tokens.css`, Tailwind preset and semantic `--ui-*` roles are wired
  into the app, with Monos's existing theme variables as the aliases.
- The Settings Help action and the notes-folder actions use the kit's `Button`.
  The rest of the product components stay in Monos and move one primitive at a
  time, as the kit's migration guide describes.
- Site screenshots were taken again from the current app.

### Changed

- `@monos/ui` is a Git dependency pinned to the `v1.0.3` tag; the kit source is
  compiled by the same Vite pipeline as the app.

## 1.5.1 — 2026-10-22

### Added

- The sidebar foot now has one **Other** menu for the map, favorites, tags,
  attachments, properties, saved searches, templates and trash. The foot keeps
  three rows on a phone as well as on a desktop: Other, Terminal, Settings.
- A note can be added to or removed from favorites from the sidebar's context
  menu; the item reads the note's own properties when the menu opens.
- Folder icons use the same picker as note icons.

### Changed

- The terminal left the board header. It opens from the sidebar foot and the
  foot of a note, and **⌘J** still works.
- Help is its own last part of Settings and is listed in the settings
  navigation; the old link at the bottom of the page is gone.
- The board's order control is a menu, not a native select, so it follows the
  kit's focus ring and accent; tags and order stay pinned above the cards.
- The header's quick-note action is icon-only; the label lives in its tooltip.
- Board card titles stop at two lines on a phone.
- Dependencies follow the current Electron 44 line; Express 5 and better-sqlite3 13
  are in place, and the backend copy of better-sqlite3 matches the app.

### Fixed

- Favorites from the sidebar and card context menus stay in sync with the
  note's current property.
- The sidebar footer fits a short phone window, with Settings always visible.
- The editor's "More" menu and the board sort menu stay inside the viewport.
- Notes-table and help links say **Other** instead of **Tools**.

## 1.5.0 — 2026-10-21

### Added

- The app speaks macOS like a macOS app: a native menu bar, a Dock menu, native
  context menus, a settings window of its own, a window that remembers its size and
  place, and `Reveal in Finder` for a note.
- A file dropped from Finder opens the note, when it is a note of the notes folder.
  Nothing else is imported, and nothing is copied into the folder.
- What happens in the background is told by the system: notes that arrived, a sync
  round that failed, a conflict to resolve. The app stays quiet while the window is
  in front, and a click on the notification shows what it was about.
- `⌘F` finds inside the note, `⌃⌘F` takes the window full screen.

### Fixed

- A note dropped outside the notes folder is refused in the window, with a line that
  says why, instead of a system dialog over the text.
- A file that lives behind a link (a temporary folder, a symlinked notes folder) is
  recognised as being inside the notes folder.
