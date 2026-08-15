# Architecture

Monos is a local-first desktop application built from a web frontend, a local HTTP API, and a filesystem-backed note store.

## System Overview

```text
Electron main process
  starts Express backend on localhost
  opens the Svelte frontend

Svelte frontend
  renders the editor, board, search, settings, and navigation
  talks to the backend through /api/*

Express backend
  reads and writes Markdown files
  maintains a SQLite search/index cache
  performs Git operations for optional sync

User data directory
  notes/           Markdown files and attachments
  .data/notes.db   rebuildable SQLite cache
```

## Runtime Modes

### Desktop Mode

Electron is the production runtime. On startup, `electron/main.cjs`:

1. Resolves the platform user data directory through Electron.
2. Sets `NOTES_ROOT` to the Monos data directory.
3. Starts the backend on a random local port.
4. Serves the built frontend through the backend.
5. Opens a BrowserWindow pointing to the local app URL.

User notes are not bundled into the app. The app creates an empty `notes/` directory on first run.

### Web Development Mode

During development, the backend and frontend run as separate processes:

- backend: `webui/backend/index.js`
- frontend: Vite dev server in `webui/frontend`

The Vite dev server proxies `/api/*` requests to the backend.

## Data Model

Markdown files are the source of truth. SQLite is a cache and index used for fast UI queries.

The backend indexes:

- file path and display name
- title, tags, and category from frontmatter
- note content for search
- wiki links and backlinks
- recent/opened metadata
- board order and visual card configuration

Because the database is rebuildable, file writes should preserve Markdown correctness first. Index updates should never be the only copy of user content.

## Storage Layout

The desktop app stores data in OS-native locations:

- Windows: `%APPDATA%/Monos/MonosData`
- macOS: `~/Library/Application Support/Monos/MonosData`

Inside `MonosData`:

```text
notes/
  Example.md
  _attachments/

.data/
  notes.db
```

## Backend Boundaries

The backend owns:

- filesystem validation and path safety
- Markdown reads/writes
- attachment uploads
- search/indexing
- Git sync routes
- settings persistence

Frontend code should call backend APIs instead of touching local files directly.

## Frontend Module Layout

The frontend code lives in `webui/frontend/src` and is split into three top-level concerns:

```text
src/
  App.svelte          composition root, top-level routing, cross-feature state
  stores.js           global Svelte stores (theme, view mode, board config…)
  components/         UI building blocks (one .svelte per concern)
  lib/                pure JS helpers (no Svelte runtime needed for most)
    api/              HTTP client + endpoint wrappers
    i18n/             reactive i18n subscription
    stores/           store utilities (persisted, etc.)
```

The split rule:

- **components/** — anything that renders pixels and dispatches events. Test with `vitest`.
- **lib/** — pure functions, parsers, formatters, API wrappers, class-string builders. Test with `node:test`.
- **stores.js** — global state shared across components. Each store is either `writable()` or a `persisted()` wrapper.
- **App.svelte** — only cross-cutting state lives here; per-feature state stays in the component that owns it (e.g. `Sidebar.svelte` keeps the tree, the editor keeps draft content).

See `docs/STATE.md` for the full state model and `docs/LIB.md` for the lib/* map.

## Theme System

Six palettes are supported (gruvbox, github, dracula, nord, solarized, catppuccin). The palette is selected through two orthogonal stores:

- `activeTheme` — the palette name, persisted in `localStorage`
- `themeMode` — `light` | `dark` | `system`, also persisted

The CSS layer is split:

- `lib/themes.js` is the **source of truth** for token values. Every palette is exported as a structured object with `light` / `dark` blocks, plus the function `applyTheme(themeName, mode)` that sets CSS variables on `document.documentElement`.
- Tailwind classes in components read those CSS variables (`bg-[var(--bg-primary)]`) — components never hardcode colors.
- A subscription in `app.css` calls `applyTheme` whenever `activeTheme` or `themeMode` changes, so theme switches are O(1) and don't require a re-render.

Per-theme note color palettes (used to tag notes) live in `lib/note-colors.js` and are derived from the same base tokens. Tests in `lib/themes.test.js` lock the official palette values to prevent drift.

## Internationalization

Strings live in `lib/strings.js` as a single structured tree (`app.*`, `sidebar.*`, `editor.*`, `templates.*`, `modal.*`, `settings.*`) with parallel `en` and `ru` blocks. The active locale is a `writable` store; `lib/i18n/t.js` exposes the `localizedText` derived store that components subscribe to with `$localizedText`.

Conventions:

- **Add a new key to both blocks** at the same time — there is no fallback to English.
- For dynamic values, expose a function: `quickNoteWillRenameTo: (target) => ...`.
- Tests in `lib/i18n.test.js` and `lib/i18n/t.test.js` check that both locales expose the same key set.

## Git Sync

Git sync is optional and operates on the user's local notes directory, not on the application source repository.

The backend validates Git inputs, keeps tokens out of remote URLs, and exposes routes for setup, status, sync, history, and conflict handling.

## Packaging

`electron-builder` creates platform installers:

- Windows: NSIS installer
- macOS: DMG (signed and notarized when credentials are available)

`better-sqlite3` is a native dependency, so Electron is pinned to a version that can rebuild it reliably in CI.

## Testing Strategy

The project uses a strict two-track split:

- **Pure JS helpers (`lib/*.js`)** — tested with Node's built-in `node:test` runner. No Svelte runtime needed, fast feedback.
- **Svelte components and `App.svelte`** — tested with `vitest` + `@testing-library/svelte`. Renders into JSDOM, simulates events with `fireEvent`.

The TDD cycle for every bug fix and most features:

1. Write a failing test that captures the desired behavior.
2. Implement the smallest change that turns it green.
3. Refactor while keeping tests green.

Tests live next to the module they cover: `lib/foo.js` + `lib/foo.test.js`, `components/Foo.svelte` + `components/Foo.test.js`.

Core checks run on every PR and on every push to master:

- backend syntax checks
- backend API/search tests
- Svelte diagnostics (`svelte-check`)
- frontend unit tests
- Playwright scale-boundary tests
- production frontend build
- Electron packaging in CI

The scale-boundary suite verifies that the layout remains usable at narrow, short, desktop, and ultrawide window sizes.
