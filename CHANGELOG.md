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
