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
