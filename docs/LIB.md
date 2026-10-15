# `lib/` Module Map

Every pure-JS helper the frontend uses, organized by what it does. Use this when you're trying to find "is there already a function for X?" or when you want to know what to test when you change one.

The split rule: `lib/` is for **pure logic**. If a module imports Svelte or has UI side effects, it belongs in `components/` instead. Every entry below should be testable with `node --test` from `webui/frontend/src/lib/`.

## API wrappers

| Module | Purpose |
|--------|---------|
| `api/client.js` | Low-level `get` / `post` / `del` / `put` around `fetch` with consistent error handling (`ApiError`, status, body) |
| `api/client.test.js` | Tests for error envelope, query string handling, network failures |
| `editor-api.js` | Wraps `loadFileContent`, `saveFileContent`, `uploadAttachment` over the HTTP client |
| `sidebar-api.js` | Tree, recents, tags, directories, create/rename/move/delete operations |
| `shell-settings.js` | Load/save the shell-level settings JSON (theme, git config, sync interval) |
| `shell-settings.test.js` | Round-trip + corrupt-input behavior |

## State and stores

| Module | Purpose |
|--------|---------|
| `stores/persisted.js` | `writable` wrapper that mirrors to `localStorage`, with `serialize` / `deserialize` / `migrate` options |
| `stores/persisted.test.js` | Migration, corrupt JSON, custom serializer, subscriber notifications |
| `app-shell.js` | Side-effect wrapper that wires the persisted stores to the document on load (theme application, font size, etc.) |
| `drag-data.js` | Serialize/deserialize drag payloads for the editor's attachment drag-and-drop |

## Theming and styling

| Module | Purpose |
|--------|---------|
| `themes.js` | Source of truth for six palettes (gruvbox, github, dracula, nord, solarized, catppuccin) — both light and dark variants. Exports `applyTheme(name, mode)` which sets CSS variables on `document.documentElement` |
| `themes.test.js` | Locks the official palette values for all 6 themes; prevents accidental drift |
| `note-colors.js` | Ten-color palette per theme for tagging notes; `getNoteColorOptions(themeName)` |
| `note-colors.test.js` | Per-theme color list length, hex validity, unknown theme falls back to gruvbox |
| `modal-button.js` | `getModalButtonClass('primary' \| 'secondary', { disabled, extraClass })` — keeps all modal footers visually consistent |
| `modal-button.test.js` | Both variants share size/case/tracking, primary is bold, secondary is muted, extraClass passthrough |
| `form-field.js` | `formFieldClass({ extraClass })` — locks `text-sm leading-6 py-1.5` for input/select baseline alignment |
| `form-field.test.js` | Required utility presence, theme variable usage, focus state |
| `form-field-alignment.test.js` | Reads `app.css` and asserts the global input rule's `py-N` matches `formFieldClass()` so the cascade doesn't silently win and shift the underline |
| `fonts.js` | Available font families and size presets; consumed by `Settings.svelte` |

## Markdown and content

| Module | Purpose |
|--------|---------|
| `note-format.js` | `displayNoteName(note)` strips `.md`; `recentPathLabel(note, fallback)` formats a "Quick Notes" style folder label |
| `note-format.test.js` | Edge cases: missing fields, mixed case extension, fallback behavior |
| `preview-html.js` | Renders a sanitized HTML preview of a markdown source; consumed by the Template Library and editor preview pane |
| `markdown-editor-content.js` | TipTap-friendly serialization of the editor's content |
| `wiki-links.js` | `parseWikiLink`, `findWikiLinks`, `replaceWikiLinks` for `[[Note Title]]` syntax |
| `wiki-links.test.js` | Multiple links per line, deduplication, malformed input, trailing punctuation |
| `note-refresh.js` | `flushOpenNote` and `announceNoteLinksUpdated`: window events that save the open note before a rename and reload it when the server rewrote its links |
| `note-refresh.test.js` | Flush waits for every listener's save; announce stays silent when no links changed |
| `local-graph.js` | `layoutLocalGraph` places the note in the centre of a small canvas, its neighbours on a ring and the links between them; `truncateLabel` shortens titles to fit |
| `local-graph.test.js` | Centre and ring positions, edges to notes outside the answer dropped, empty and partial graphs, label truncation by characters |
| `properties.js` | `propertyName`, `propertyValueFrom` and `isCalendarDate` check a property name and a form value against its type, as the server does; `propertyInputText` and `propertyInputType` feed the inputs |
| `properties.test.js` | Name rules (managed keys and YAML characters refused), calendar dates, values per type, list text in a field |
| `callouts.js` | `calloutMarker` reads an Obsidian callout marker (`[!warning] Title`) from a quote's first line, `calloutTone` picks its colour family, `unescapeCalloutMarkers` keeps the marker bare when the note is saved |
| `service-worker.js` | `shouldRegisterServiceWorker` says whether the app registers its install worker (`public/sw.js`): a production build, HTTPS and a browser that supports it |
| `callouts.test.js` | Marker type and title, plain quotes and link-like brackets not taken for callouts, tone by type, escaped markers restored on save |
| `richEditorExtensions.js` | TipTap extension set used by the rich editor |
| `rich-editor-paste.js` | Paste handler for the rich editor: images, links, plain text fallbacks |
| `markdown-burst.js` | `isMarkdownBurst(text)` tells an input event that carries Markdown (dictation, IME, a line inserted at once) from typing, so the rich editor parses it instead of keeping the syntax as escaped text |
| `markdown-burst.test.js` | Plain text stays plain, block and inline markers are detected, a bare `2024.` is not a list |

## Templates

| Module | Purpose |
|--------|---------|
| `note-templates.js` | Built-in template catalog (Daily Note, Meeting Notes, Project Brief, 1:1, Research, Topic MOC, Atomic Note, etc.) and `buildTemplateContent` to render them |
| `template-library.js` | Manages custom user templates, hidden-library flags, persistence to `localStorage` |
| `template-preview.js` | `extractTemplateMetadata(markdown)` splits a template's "Label: value" header from its body so the preview can show fields in a grid |
| `template-preview.test.js` | Typical templates, missing H1, no-blank-line variants, URL values, multi-word labels |
| `date-format.js` | `localeDate(date, locale)` writes 14.10.2026 for ru and 2026-10-14 otherwise; `localeMonth` and `localeStamp` (the title of quick and daily notes) follow the same split |
| `date-format.test.js` | Russian and ISO dates, months, the time stamp with dashes, no colons in file names |
| `file-name.js` | `fileNameProblem(name)` names what a name cannot be: forbidden characters (the Windows set), a trailing dot or space, a reserved device name, too many bytes — or null; the backend applies the same rules |
| `file-name.test.js` | Allowed names, each forbidden character, edge dots and spaces, reserved names, the UTF-8 length limit, empty input |
| `quick-note-rename.js` | `resolveQuickNoteRename(current, new, ext='.md')` decides if a quick note should be renamed before opening |
| `quick-note-rename.test.js` | Case-insensitive equality, empty input, extension normalization |

## Search and command palette

| Module | Purpose |
|--------|---------|
| `search-query.js` | Parses the search input into terms, quoted phrases, and exclusions |
| `search-query.test.js` | Quotes, exclusions, mixed syntax |
| `search-results.js` | Ranks and groups raw matches; consumed by the search panel |
| `search-results.test.js` | Score ordering, empty results, group boundaries |
| `search.js` | Client-side search that combines the query parser and results ranker (consumed by the sidebar search bar) |
| `search.test.js` | End-to-end behavior with mock notes |
| `command-palette.js` | Item model and keyboard navigation logic for the Cmd+K palette |
| `command-palette.test.js` | Filtering, selection wrapping, disabled items |
| `shortcut-label.js` | `shortcutLabel(text)` renders `Ctrl+K` as `⌘K` on macOS and `Shift` as `⇧`; `isMacPlatform()` decides which form to show |
| `shortcut-label.test.js` | Labels stay as written off macOS, macOS symbols, empty input |

## Paths and IDs

| Module | Purpose |
|--------|---------|
| `paths.js` | `normalizeNotePath`, `stripNotesPrefix`, etc. — single source of truth for the `notes/` path convention shared between frontend and backend |
| `paths.test.js` | Trailing slashes, leading slashes, double slashes, root |

## Sidebar and dashboard

| Module | Purpose |
|--------|---------|
| `sidebar.js` | The Sidebar component's public API surface (re-exported for `App.svelte` via `bind:this`) |
| `sidebar.test.js` | Public method contracts |
| `sidebar-utils.js` | Tree manipulation helpers: sort, filter, find-by-path |
| `sidebar-utils.test.js` | Tree shape edge cases |
| `sidebar-pinned.js` | `pinnedNotes` store + `pinNote` / `unpinNote` / `updatePinnedPath` actions |
| `sidebar-pinned.test.js` | Pin/unpin flow, reordering, stale-path repair after rename |
| `tree-icons.js` | Named lucide icons used by the tree and sidebar, exported as one `Icon` object (no namespace import, so unused icons are tree-shaken) |
| `tree-icons.test.js` | Every imported icon is exported by `lucide-svelte` |
| `sidebar-api.js` | Wrappers for the sidebar's HTTP endpoints (see also API wrappers above) |
| `context-menu-position.js` | `computeContextMenuPosition(rect, menuSize, viewport)` — keeps the right-click menu inside the viewport |
| `context-menu-position.test.js` | Bottom overflow, left overflow, exact fit |
| `dashboard.js` | `buildDashboardSections(notes, opts)` — what cards appear on the home view, in what order, with what grouping |
| `dashboard.test.js` | Empty notes, mixed categories, color grouping on/off |

## i18n

| Module | Purpose |
|--------|---------|
| `strings.js` | The complete en + ru string tree. Adding a key requires updating both blocks |
| `i18n.js` | Helpers for locale detection, fallback handling, and `pluralize` |
| `i18n.test.js` | Locale detection, fallback rules |
| `i18n/t.js` | `localizedText` derived store + `t(keyPath, ...args)` accessor |
| `i18n/t.test.js` | Subscription, fallback to en on missing key, formatter functions |

## Editor helpers

| Module | Purpose |
|--------|---------|
| `outline.js` | Builds the heading outline from markdown/TipTap content for the outline panel |
| `outline.test.js` | Nested headings, empty documents, heading-level edges |
| `motion.js` | `scrollBehavior()`: `auto` when the user asked for reduced motion, `smooth` otherwise |
| `motion.test.js` | Smooth by default, instant under `prefers-reduced-motion` |
| `categories.js` | Category field helpers: `normalizeCategory`, `canonicalCategory` (reuses an existing spelling, ignoring case) and `filterCategories` for the suggestions |
| `categories.test.js` | Whitespace cleanup, case-insensitive matching, prefix matches ranked first |
| `frontmatter.js` | YAML frontmatter helpers: `splitFrontmatter`, `parseFrontmatter`, `upsertFrontmatter`, `setFrontmatterKey`, plus the due-date helpers `dueStatus` and `dueLabel` |
| `due-input.js` | `parseDueInput(text)` accepts an ISO (`2026-12-24`) or dotted (`24.12.2026`) date and returns the stored `YYYY-MM-DD`, or refuses it; `formatDueInput(due, locale)` is the reverse for the field |
| `due-input.test.js` | Dotted and ISO input, two-digit years, impossible dates, leap years, the display form per language |
| `git-history.js` | Note history served by git: list the revisions of a note, read one with its diff, restore one (`noteHistoryRequest`, `noteRevisionRequest`, `restoreNoteRevisionRequest`) |
| `git-history.test.js` | Request paths and methods, error text taken from the backend |
| `markdown-extras.js` | Turns TipTap math and Mermaid nodes back into markdown (`convertMarkdownExtras`) and finds inline `$…$` formulas (`findInlineMath`) |
| `reminders.js` | Due-date reminders: notification permission, and at most one native notification per note and due date (`notifyDue`, `wasNotified`) |
| `richEditorExtras.js` | TipTap nodes for inline math, math blocks, Mermaid diagrams and note embeds |
| `richEditorExtras.test.js` | Node names, which TipTap uses to tell the nodes apart |
| `saved-searches.js` | Saved searches stored next to the notes: load, add (saving the same query again only renames it), rename, remove; rolls back when the disk write fails |
| `saved-searches.test.js` | Add, rename and remove; the empty query; rollback on a failed write |
| `task-progress.js` | Counts finished and total task-list items in a note (`taskProgress`) and formats the status line (`formatTaskProgress`) |
| `word-stats.js` | `wordStats(text)` — word/character counts and estimated reading time (200 wpm) |
| `word-stats.test.js` | Empty text, rounding up to 1 minute, whitespace handling |
| `quick-switcher.js` | Quick-switcher parsing and filtering: `note:`, `tag:` prefixes, fuzzy note matching |
| `quick-switcher.test.js` | Prefix parsing, tag filters, ranking |

## Backup, print and clipping

| Module | Purpose |
|--------|---------|
| `backup.js` | ZIP export/import for the notes folder — shared by Settings and the empty board |
| `backup.test.js` | Filename from headers, error paths, empty selection |
| `print.js` | Print a note or a whole folder; PDF save, plus the browser print view |
| `note-export.js` | `exportFileName(title, ext)` makes a safe file name; `markdownToPlainText(md)` drops the markup; `fetchNoteHtml(path)` reads the print view; `downloadFile(name, content, type)` starts the download |
| `note-export.test.js` | File names from titles, plain text from Markdown (headings, lists, task marks, code, tables), the print view request and its errors |
| `print.test.js` | Request shapes, desktop-only error, print-view URLs |
| `clipper.js` | Reads the web-clipper token from the app (app origin only) |
| `clipper.test.js` | Token fetch, refusal path |
| `info.js` | Reads the real notes folder from `/api/info`, shown in Settings |
| `info.test.js` | Path fetch, error path |
| `git-sync.js` | Background pull: on launch and on a timer, never while a note is unsaved |
| `design-tokens.test.js` | Design-system guard: control, icon, spacing, radius and stroke scales |
| `conflict-markers.js` | Detects and resolves git merge-conflict markers inside a note's raw Markdown |
| `conflict-markers.test.js` | Region parsing, zdiff3 base section, resolution, setext false positive |

## Icons and visual

| Module | Purpose |
|--------|---------|
| `icons.js` | List of available `lucide-svelte` icon names for the icon picker |
| `attachments.js` | Helpers for the editor's attachment model (sort, dedupe, find by name) |

## Adding a New Module

1. Put the source in `lib/<feature>.js`.
2. Put the test in `lib/<feature>.test.js`.
3. Use `node:test` and `node:assert/strict` — match the existing style.
4. If the module exposes a function for a class string (like `formFieldClass` or `modalButtonClass`), tests should assert that the right Tailwind utilities are present so the visual behavior can't drift.
5. Add a one-line entry to the table above.