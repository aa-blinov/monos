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
