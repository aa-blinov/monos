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

## 1.17.7 — 2026-10-24

### Changed

- Every menu now looks the same. The sort menu, the context menus of the sidebar and of a board card, the terminal's
  menu and the editor's view and more-tools menus share one panel and one row: sentence case, left aligned, the same
  height and spacing, a coloured row only for the destructive one (`lib/menu-style.js`). The sidebar menu used to be
  upper case, widely spaced and centred, the card menu bold.

## 1.17.6 — 2026-10-24

### Fixed

- A choice kept on the server (sort order of attachments, board columns and the like) is no longer undone by a reload right
  after the click. The reloaded page could read the settings before the write from the closing page had landed, and the
  older server value won. A choice the server has not confirmed is marked in the browser's copy, wins on the next load
  and is sent again; the mark goes once the server has it.

### Changed

- Pinned notes in the sidebar show the note name only. The folder line under each name read like a second note in the
  list and was hard to tell apart; the path is still shown inside the note once it is open. The rows now follow the
  tree's numbers: 32px tall, 4px apart (they were 2px) and the same right edge (they ran 8px past it).

## 1.17.5 — 2026-10-24

### Fixed

- The app no longer freezes on launch while macOS asks for the keychain password. Loading the settings used to decrypt
  the GitHub token every time, and after an update the keychain asks again (the signature changes), so the window stayed
  empty until the password was typed. The settings now answer with `git_token_set` only; the token is read from the
  keychain on its own route when a GitHub call really needs it (the sync section of Settings coming into view, a
  sync). Signing out clears the token at once. Saving the settings never writes an empty token over the stored one.

## 1.17.4 — 2026-10-24

### Fixed

- The macOS app opens after a download. The build had no signing identity, so the bundle's seal did not match its
  `Info.plist` (`codesign --verify` failed with "code has no resources but signature indicates they must be present"),
  and with the quarantine mark a browser puts on a file macOS did not start the app at all. An ad-hoc signature over the
  whole bundle (`scripts/adhoc-sign.cjs`, run after packaging; a real identity is left alone, and the build fails if the
  signature does not verify) puts it on the usual path for an app that is not notarized: macOS says it could not check
  the developer and **Open Anyway** in Privacy & Security opens it, as the release notes describe. Checked on a copy of
  the arm64 build with the quarantine mark set: it reaches that dialog; the 1.17.3 build did not start.

## 1.17.3 — 2026-10-24

### Fixed

- Text buttons in the first-run cards and in the New note dialog line up with the text above them instead of standing
  16px to the right of it.
- 1.17.2 was tagged but never published: its macOS Intel build could not download headers from electronjs.org. Its only
  change, the sound library in the Linux package, is part of this release.
- The packaged macOS app (arm64) was built and run for this release: native menu, window, backend on a random port,
  Cyrillic note create and search, the New note command from the Note menu.

## 1.17.2 — 2026-10-24

### Fixed

- The Linux `.deb` now declares the sound library it needs (`libasound2t64 | libasound2`). A minimal Ubuntu install
  without it could not start the app at all. The package was installed and run in an Ubuntu 24.04 container for this
  check: the app starts, the backend answers, a note named `C# notes` is created and trashed to `notes/.trash`.

## 1.17.1 — 2026-10-24

### Fixed

- A note that ends with a horizontal rule, a code fence, a table or a list no longer gets its last block glued to the
  text you type after it (`***` followed by `QQ` was written as `***QQ`, which destroyed the rule). The desktop
  builds of 1.17.0 stopped on this, so 1.17.0 has no installers; 1.17.1 replaces it.
- A mixed bullet and task list stays one list after an edit, and table column alignment survives an edit.
- On a short phone screen the editor keeps 61% of the height for text (the header, toolbar and footer compact when the
  keyboard is up), and renaming a note into the name of a trashed one explains itself and offers to restore it.
- The interface kit is `@monos/ui` 1.5.3: no Svelte warning from its fields, and a focus trap that skips controls
  that are not in the tab order.

## 1.17.0 — 2026-10-24

A release-readiness pass: a QA review of the backend, the interface and the user paths, and the fixes it led to.

### Security

- With network access on, the clipper token is no longer handed to other devices, and the GitHub token is returned only
  to this computer. Publishing and the settings routes that write outside the notes folder are this-computer only.
- The notes folder's `.git`, `.monos` and any dot-folder can no longer be written, renamed or deleted through the API.
  Paths are normalised once, so `notes/./Note.md` cannot dodge the trash and lock checks.
- A published or printed note can no longer carry a script: links are checked against a scheme allow-list after entities
  are decoded, and print and publish pages ship a restrictive Content-Security-Policy.
- A zip import is bounded (per entry, in total and by entry count), checks every entry name first and either applies
  fully or reports what it skipped; symlinks inside the notes folder are ignored.

### Fixed

- Notes with `#` or `%` in their name open again (the address is encoded segment by segment; a broken `%` in a page
  address no longer returns an error).
- The first-run "Start writing" button has a readable label and a 44px height.
- The editor no longer rewrites a note behind your back: strikethrough, `\|` in table cells, footnotes, `![[embeds]]`,
  fence languages, list numbering, `<` `>` `&`, task lists and the end of the file all survive; a block you did not
  touch is written back byte for byte.
- Deleting a note moves it to a hidden `.trash` folder next to its place, so the trash survives a rebuilt index, reaches
  other devices through sync and is left out of exports. Deleting a folder goes to the trash too. Folder icons and
  colours are kept in `.monos/folders.json`.
- Moving a note carries its pictures along. A trashed note no longer blocks its name; the New note dialog offers to
  restore it. Duplicates are named "copy" or "копия" to match the interface language.
- Search finds text with a double quote and text typed in a different Unicode form (`Café`, decomposed `й`).
- Saving never overwrites a file that is not valid UTF-8, and rejects names the system cannot hold on every folder
  level. A case-only rename works on macOS.
- Publishing builds the new site before replacing the old one. Errors from the API are `{ detail, code }` with no paths.
- The last moments of typing are saved when a browser tab is closed or reloaded. Board sort, columns, grouping, content
  width, line spacing and similar choices are kept on the server, so a new port on launch no longer resets them.
- Phone layout: the note footer is one row of icons, touch targets are at least 44px, a short screen leaves room to
  write, the trash notice no longer covers the sidebar footer, and the palette and the card menu work from the keyboard.
- Contrast of error, warning and success text, long titles and the conflict-copy row, the tab title of every page, and a
  real "Not found" page.

## 1.16.37 — 2026-10-24

### Changed

- The interface kit is `@monos/ui` 1.5.0: typefaces with a picker, iPhone and
  Android profiles, a mind map and a sectioned landing page. The app itself
  looks the same; it keeps its own font list in Settings.

## 1.16.36 — 2026-10-24

### Fixed

- The board's retry button and the trash notice's dismiss and undo buttons are
  kit `Button`s; the last native text buttons were left behind by the move onto
  `@monos/ui`.
- The phone note footer: the Folder and Links buttons stack the icon over the
  label again, and the property buttons wrap to a second row instead of
  overlapping the History and Export icons.
- Rows that put `justify-between` on a kit `Button` (related notes, attachment
  folders, a Settings list) spread their name and count again, and the
  ambiguous wiki-link picker stacks the name over the path. Both came from the
  kit `Button` label wrapper; the app is on `@monos/ui` 1.3.1.
- Attachments: the thumbnails, the note links and the row above the grid lose
  the kit button's side padding, so they line up with the cards and the broken
  image label is no longer cut.

## 1.16.35 — 2026-10-22

### Changed

- A housekeeping release: Playwright artifacts are no longer tracked and
  `test-results/` is ignored, so the house-style check passes on the tag.

## 1.16.34 — 2026-10-22

### Fixed

- The new-note, template, agent-review, help-result and continue-work cards
  declare `flex`, so their multi-line content stacks inside the card instead of
  spilling across the row.
- Site screenshots were taken again.

## 1.16.33 — 2026-10-22

### Fixed

- Kit `Button` keeps its label and trailing icon on one line, so the board's
  "Recently changed" trigger no longer drops its chevron under the text.
- `@monos/ui` is `1.1.20`.
- Site screenshots were taken again.

## 1.16.32 — 2026-10-22

### Changed

- The UI migration is complete: every visible button, chip, menu row, field,
  select and text area in the app is a kit primitive. The last categories were
  the note map, command palette, sidebar header/footer, favourites, trash,
  conflict views, info/confirm modals, agent settings, the wiki-link bar, the
  raw-source editor and the note table.
- Deliberate native exceptions are documented in the README: the outline drag
  handle, OS-drawn file/colour/date inputs and `TooltipIconSelect`'s transparent
  select.
- The new-note, template, agent-review, help-result and continue-work cards use
  `Card as="button"` instead of a text `Button`, so their multi-line content is
  not truncated.
- `FieldControl` gained native-listener glue in hosts that need `Enter`/`Escape`
  on a specific field.
- Site screenshots were taken again.

## 1.16.31 — 2026-10-22

### Changed

- Every native `<select>` and `<textarea>` in app components is the kit's
  `FieldControl`; the remaining text/password inputs in templates, renames,
  saved searches, agent settings, tags, folders and locks are `FieldControl`.
- Only the outline column's drag handle stays a native `<button>` (it owns
  pointer capture), and a few file/date/color inputs stay native.
- Site screenshots were taken again.

## 1.16.30 — 2026-10-22

### Changed

- All remaining native `<button>` elements in app components are now kit
  controls; only the outline drag handle stays a native button because it owns
  pointer capture.
- Note map, command palette, sidebar header/footer, favorites, trash, conflict
  views, info/confirm modals, agent settings and the editor's wiki-link bar are
  included.
- Site screenshots were taken again.

## 1.16.29 — 2026-10-22

### Changed

- The sidebar's modals and template cards are on kit controls; only the theme
  cards in Settings are rendered with `Card`.
- Settings' conflict links, publish, broken/orphan/stale lists, conflict-copy
  actions and clipper token are kit `Button`.
- Attachments' note lists, folder choices, load-more, zoom, copy and trash are
  kit controls; one test selector was relaxed for button text.
- Site screenshots were taken again.

## 1.16.28 — 2026-10-22

### Changed

- The notes table's sort headers, note links and cells are kit `Button`.
- The tag panel and saved-searches panel are on kit `Button`/`IconButton`; the
  terminal agent actions and context menu are kit `Button`.
- Site screenshots were taken again.

## 1.16.27 — 2026-10-22

### Changed

- The continue-work, rename, URL-prompt, quick-note-saved, agent-review,
  note-history, locked-conflict and first-run modals are on kit buttons.
- Help's section chips are `FilterChip`; sections, topics, results and "top" are
  `Button`; `aria-current` stays.
- Site screenshots were taken again.

## 1.16.26 — 2026-10-22

### Changed

- The template manager is on kit `Button`; the template row actions and its
  modal footer are kit controls.
- The conflict view's whole-note choices, per-region choices and Apply are kit
  `Button`; `aria-pressed` and the diff rendering stay.
- The rich editor's table/code tools are kit `Button`, and its "more" trigger is
  `IconButton`.
- Site screenshots were taken again.

## 1.16.25 — 2026-10-22

### Changed

- The rich editor's table/code-block tools are the kit's `Button`, and its
  "more tools" trigger is the kit's `IconButton`.
- Site screenshots were taken again.

## 1.16.24 — 2026-10-22

### Changed

- The new-note modal's cancel/create/open-existing/numbered-copy actions are the
  kit's `Button`.
- Site screenshots were taken again.

## 1.16.23 — 2026-10-22

### Changed

- The rich editor's find bar buttons are the kit's `IconButton`; view options
  and the "more tools" menu items are the kit's `Button`.
- Site screenshots were taken again.

## 1.16.22 — 2026-10-22

### Changed

- Settings' git authenticate/connect/sync/refresh/conflict actions and the LAN
  copy/show-QR/renew actions are the kit's `Button`.
- Site screenshots were taken again.

## 1.16.21 — 2026-10-22

### Changed

- The sidebar's "Создать", phone sync row and the review/conflict rows are the
  kit's `Button`; the create button has `tree-new-note` for tests.
- Site screenshots were taken again.

## 1.16.20 — 2026-10-22

### Changed

- The sidebar's twelve context-menu actions are the kit's `Button`; their
  custom positioning, role and destructive colour stay.
- Site screenshots were taken again.

## 1.16.19 — 2026-10-22

### Changed

- The attachments view's text actions (retry, select, trash, restore, undo,
  copy, load more) are the kit's `Button`, and its previous/next controls are
  the kit's `IconButton`.
- Site screenshots were taken again.

## 1.16.18 — 2026-10-22

### Changed

- The attachments view's filter chips are the kit's `FilterChip`, its kind and
  sort selects are `FieldControl`, and its folder picker is a `Button`.
- Site screenshots were taken again.

## 1.16.17 — 2026-10-22

### Changed

- The board's card context menu uses the kit's `Button` for its five actions
  and `IconButton` for the colour swatches; positioning and Escape stay.
- Site screenshots were taken again.

## 1.16.16 — 2026-10-22

### Changed

- The folder/category trigger in the editor footer is the kit's `Button`; the
  panel's `aria-haspopup`, `aria-expanded` and focus return stay.
- Site screenshots were taken again.

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
