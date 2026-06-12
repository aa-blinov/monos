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

## Frontend Boundaries

The frontend owns:

- responsive layout
- editor interactions
- board rendering and card actions
- search UX and highlighting
- settings screens
- local UI preferences stored in browser storage

Shared frontend API helpers live in `webui/frontend/src/lib`.

## Git Sync

Git sync is optional and operates on the user's local notes directory, not on the application source repository.

The backend validates Git inputs, keeps tokens out of remote URLs, and exposes routes for setup, status, sync, history, and conflict handling.

## Packaging

`electron-builder` creates platform installers:

- Windows: NSIS installer
- macOS: DMG

`better-sqlite3` is a native dependency, so Electron is pinned to a version that can rebuild it reliably in CI.

## Testing Strategy

Core checks:

- backend syntax checks
- backend API/search tests
- Svelte diagnostics
- frontend unit tests
- Playwright scale-boundary tests
- production frontend build
- Electron packaging in CI

The scale-boundary suite verifies that the layout remains usable at narrow, short, desktop, and ultrawide window sizes.
