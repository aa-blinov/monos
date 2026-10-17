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

## Device Model

Each device runs its own Monos over its own notes folder and syncs only through the user's GitHub repository (see Git Sync Across Two Devices). Nothing connects to another device's Monos, except the optional Wi-Fi view of this computer's notes (`lan-access.js`), which serves notes and never the terminal.

The agent terminal is local to the desktop app:

```text
Electron main process
  node-pty: one shell per terminal, working directory = this device's notes folder
  ipcMain: terminal:create / write / resize / kill; output and exit sent to the window
preload (contextBridge)
  window.monosTerminal: the only way the page reaches a shell
Svelte frontend
  TerminalPanel: xterm.js in the theme's colours, bottom dock, ⌘J / Ctrl+`
Express backend
  notes-folder watcher: files changed by the agent (or anything else) are reindexed
  and announced to the page over /api/events, so the board, the tree and an open note follow
```

The shell is never reachable over HTTP: the backend has no terminal route, and a browser or phone client has no `window.monosTerminal`.

The agent is the command chosen in Settings → Agent (`agent_command`: `claude`, `codex`, `gemini` or any other). "Start the agent" types it into the shell; "Ask the agent about this note" types the command with a question that names the note's path, leaving the cursor inside it, or, when the agent already runs in the foreground (`terminal:process`), types the question into the agent. `agent-rules.js` writes `AGENTS.md` (the rules: frontmatter, links, attachments, locked notes, no history rewrites) and `CLAUDE.md` / `GEMINI.md` (which import it) at the top of the notes folder, on request and never over a file that is there; the index skips them, so they are not notes.

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
  storage.json
  clipper-token
```

The notes folder is `notes/` unless the person chose another one (Settings → Notes folder). The choice is kept in `.data/storage.json` and opens on the next start; a folder outside `MonosData` can be an Obsidian vault or a folder a cloud service syncs. Monos never moves notes between folders. Each folder has its own index (`.data/notes.db` for the default folder, `.data/notes-<hash>.db` for a chosen one). Whatever folder is open, the app names a note as `notes/…` from the data root, so links, the API and the database keep one form. `config.js` reads the choice once at start; `notes-folder.js` writes it.

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

## Typography Scale

The interface has exactly one size knob: `--font-size-base`, set on `html` by
`applyTypographyVars()` from the `fontSize` store (14 / 16 / 18 / 20px). Tailwind's
`rem`-based steps scale with it automatically.

The metadata whisper is **derived**, not hard-coded:

| Variable | Ratio | At 16px base |
|---|---|---|
| `--text-whisper` | 0.625 × base | 10px |
| `--text-whisper-lg` | 0.6875 × base | 11px |

Use `text-[length:var(--text-whisper)]`. Two rules, both learned the hard way:

1. **Never a literal `px` size.** 74 occurrences of `text-[9px]` / `text-[10px]` /
   `text-[11px]` used to ignore the size setting entirely, so raising the
   interface size grew the headings while the whisper stayed at 9–10px —
   inverting the hierarchy. There are now no literal px font sizes in `components/`.
2. **The `length:` hint is required.** Tailwind cannot infer that a bare `var()`
   is a font-size and emits it as a *colour* instead, so `text-[var(--text-whisper)]`
   silently produced no font-size at all and the element inherited the root size.
   `text-[length:var(--text-whisper)]` is the only form that works.

JetBrains Mono is a variable font covering `wght` 100–800; the interface uses 400,
500, 600 and 700, all real strokes. No `font-feature-settings` override is set:
contextual ligatures (`calt`) stay on at the browser default, which suits the
technical register, and figures are tabular by construction — a monospaced face
has no proportional figures. The `tabular-nums` classes that remain are harmless
defence in case the family ever fails to load and a proportional fallback is used.

## Text Contrast

Two text steps are governed by a hard WCAG AA guarantee rather than by brand
fidelity. Both are regression-tested in `lib/themes.test.js` against every
surface where they are actually used: `--bg-primary`, `--bg-secondary`, and a
note card carrying the 13% `--note-tint` accent for each of the seven accents.

**`--text-tertiary`** — the metadata whisper (9–10px paths, timestamps). It used
to stack opacity onto `--text-secondary` and measured ≈2.2:1. Its value is
derived per theme/mode to clear 4.5:1 on the worst tinted card.

**`--text-secondary`** — body-size text: 14px note excerpts, field labels, and
supporting copy. It also appears on `--bg-secondary` in 17 places. The upstream
palette values fall below AA on those surfaces in 10 of 12 theme/mode pairs —
worst is dracula.dark at **1.94:1**. Each shipped value is the *minimum* shift
from the upstream colour that clears 4.5:1 everywhere the token is used.

| Theme | Mode | Upstream | Shipped | Worst surface |
|---|---|---|---|---|
| gruvbox | light | `#7c6f64` | `#6a5e55` | 4.52:1 |
| gruvbox | dark | `#a89984` | `#b1a491` | 4.53:1 |
| github | light | `#656d76` | `#626972` | 4.50:1 |
| github | dark | `#8b949e` | unchanged | 4.98:1 |
| dracula | light | `#6c664b` | `#5f5a42` | 4.50:1 |
| dracula | dark | `#6272a4` | `#adb6d0` | 4.52:1 |
| nord | light | `#4c566a` | unchanged | 5.55:1 |
| nord | dark | `#929aab` | `#b1b6c3` | 4.51:1 |
| solarized | light | `#657b83` | `#56686f` | 4.51:1 |
| solarized | dark | `#586e75` | `#909fa3` | 4.53:1 |
| catppuccin | light | `#6c6f85` | `#5c5f71` | 4.50:1 |
| catppuccin | dark | `#9399b2` | `#9ba0b7` | 4.51:1 |

Reducing `--note-tint` was evaluated and rejected: it does not close the gap,
because `--bg-secondary` — not the tint — is the binding surface in the worst
cases (dracula.dark stays at 1.94 even at a 6% tint).

What stays official: every background layer, `--text-primary`, `--text-muted`,
and all seven accents. Palette identity is preserved where it is visible as
identity; only the two secondary text steps are accessibility-governed.

## Self-Hosted Font

JetBrains Mono ships inside the repository. The interface makes no network
request of its own, so the family is not fetched from a CDN at runtime.

- `webui/frontend/public/fonts/*.woff2` — one variable file per subset
  (`latin`, `latin-ext`, `cyrillic`, `cyrillic-ext`).
- `webui/frontend/src/fonts.css` — `@font-face` rules, imported first in
  `app.css` so the faces are registered before Tailwind's base layer.
- One file per subset covers the full 100–800 weight range, so 400/500/600/700
  are real strokes rather than synthetic bold.
- Cyrillic subsets are required: `en` and `ru` are both first-class.
- Licensed under SIL OFL 1.1; the license travels with the files as
  `LICENSE-JetBrainsMono.txt`.

Replacing the family means swapping the files in `public/fonts/`, the `src`
value in `fonts.css`, and the `fontOptions` list in `lib/fonts.js` together —
the system collapses `.font-serif`, `.font-sans`, and `.font-mono` onto one
stack on purpose, so the swap must be all-or-nothing.

## Print and PDF

`webui/backend/routes/print.js` renders Markdown to a self-contained HTML
document using `marked`, inlining attachments as data URIs.

| Endpoint | Returns |
|---|---|
| `GET /api/print/note?path=notes/...` | one note as HTML |
| `GET /api/print/tree?path=<folder>` | every note under it as one book, HTML (empty path = whole notes folder) |
| `POST /api/print/pdf` `{scope, path}` | save a PDF via Electron `printToPDF` |

The two GET endpoints work anywhere and are useful for the browser's own Print
dialog. Saving a PDF needs a renderer, so it exists only when the backend runs
inside the Electron main process; under plain `node index.js` the endpoint
returns 501 with a message saying so, rather than failing obscurely.

The print stylesheet deliberately drops the interface's mono-everywhere rule: a
printed note is prose first. It keeps Gruvbox's warm paper, ink and link colour
so the output is still recognisably Monos, and renders attachments inline so the
file survives being mailed around.

## Web Clipper

The browser extension lives in `clipper/` (unpacked, MV3) and posts to
`POST /api/clip/notes`.

Security model — this endpoint is the only write path reachable from a browser
extension, so it is gated twice:

1. **Bearer token.** 32 random bytes, hex-encoded, stored at
   `.data/clipper-token` with mode `0600`. Presented as `Authorization: Bearer`
   or `X-Monos-Clip-Token`, compared with `crypto.timingSafeEqual`. Delete the
   file and restart to rotate.
2. **Origin.** Only the app itself and `chrome-extension://` /
   `moz-extension://` origins are accepted. Extension ids cannot be enumerated
   ahead of install, so the scheme is matched — which is exactly why the token
   exists.

The global Origin filter in `index.js` exempts `/api/clip/` and nothing else.
Allowing extension schemes globally would let any installed extension read the
entire notes API; the exemption is deliberately narrow and the checks are
re-imposed inside the route.

`appOrigins` is passed as a **function**, not a value: `electron/main.cjs` sets
`ALLOWED_ORIGINS` *after* importing the backend, because the port is only known
once the server binds. Capturing the list at registration time left the dev
defaults in place and made a packaged app reject its own origin.

`webui/backend/clip.test.js` covers the token, the Origin check, path escape,
collision handling and the token-read boundary.

## Internationalization

Strings live in `lib/strings.js` as a single structured tree (`app.*`, `sidebar.*`, `editor.*`, `templates.*`, `modal.*`, `settings.*`) with parallel `en` and `ru` blocks. The active locale is a `writable` store; `lib/i18n/t.js` exposes the `localizedText` derived store that components subscribe to with `$localizedText`.

Conventions:

- **Add a new key to both blocks** at the same time — there is no fallback to English.
- For dynamic values, expose a function: `quickNoteWillRenameTo: (target) => ...`.
- Tests in `lib/i18n.test.js` and `lib/i18n/t.test.js` check that both locales expose the same key set.

## Git Sync Across Two Devices

The git repository is the `notes/` folder itself — every `gitExec` call runs with
`cwd: NOTES_DIR`. So only `.md` files and attachments are ever committed, and the
rebuildable SQLite index in the sibling `.data/` never enters the shared history.

### Repository hygiene

`writeRepoHygieneFiles()` drops two managed files into `notes/` on first setup and
again on every sync (it never overwrites a file the user wrote by hand):

- **`.gitattributes`** — `* text=auto eol=lf`. Git's `text=auto` heuristic already
  normalises most files on commit, but it is a *heuristic*: a file it decides is
  binary, or content committed before the rule existed, keeps CRLF forever. Declaring
  it removes the guesswork, so a note edited on Windows and one edited on macOS
  cannot diverge by line endings alone.
- **`.gitignore`** — `.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*`, `*~`, `*.tmp`,
  editor swap files, and `.monos/`. AppleDouble files in particular appear whenever
  the folder is written to a non-native volume and would otherwise be committed by
  `git add -A` on one device and show up as foreign changes on the other.

Note that ignoring a path does not untrack a file that is already committed; an
existing repository with junk in its history needs `git rm --cached <path>` once.

### Commit-then-pull, and why the order matters

`/api/git/sync` stages and commits locally *before* pulling. The reverse order fails
outright: git refuses to pull when incoming commits touch files that have uncommitted
local changes, so the sync would break precisely in the two-device case where both
sides edited. Committing first makes the divergence explicit and lets the merge
decide.

- Different notes on each device → clean merge, no conflict.
- The same note on both → whole-file conflict, surfaced through the existing
  `ConflictResolver`, which shows both versions in full.

### Automatic sync

Every interval the app runs one round (`lib/git-sync.js`). The interval is set in Settings → Sync Settings and is 15 minutes by default. A round downloads what the other devices sent. When the person chose it, a round also uploads this device's changes first: a commit, then pull, then push, the same as the Sync button (`POST /api/git/sync`). A round that only downloads is `POST /api/git/pull`. Rounds start at launch and run while the app is open.

Two choices in Settings are independent of each other:

- **Upload during the automatic sync** is on by default. Each round commits and pushes what changed on this device.
- **Upload when the app closes** is off by default. Before the backend stops, the desktop app calls `POST /api/git/sync-on-quit`. It runs the same sync only when this option is on, and the app stops waiting after 20 seconds, so a slow network cannot hold the quit. What did not go up is uploaded at the next sync.

A round is skipped while a note is unsaved or saving, and it is answered 400 and skipped while no remote is configured. Git tasks run one at a time (`runGitTask` in `routes/git.js`), so an automatic round and the Sync button never hold the index together.

Download never needs the person: a device that went stale catches up by itself. Upload is either automatic (the choices above) or manual with the Sync button. Conflicts are shown the same way in both cases.

### Before anything is pushed: what GitHub will actually allow

`GET /api/git/repo-check?token=&repo=` reports, from GitHub's own API, whether
the repository is private and which scopes the token actually carries. Settings
calls it whenever a repository is selected and shows two warnings:

- **a public repository** — notes pushed there become public text, and git
  history keeps them public after a note is deleted. `POST /api/git/setup`
  refuses to proceed on a public repository unless the caller passes
  `acknowledgePublic: true`; the guard runs before `git init`, so a refusal
  leaves no repository behind.
- **scopes beyond `repo`** — `workflow`, `admin`, `delete_repo` and `gist` are
  named with what each one costs. A fine-grained token scoped to this single
  repository is enough.

### Token storage

The token grants access to every private repository the user owns, so it is
wrapped in the OS keychain (Electron `safeStorage`: Keychain / DPAPI /
libsecret) before it reaches the settings table, with no new dependency. Outside
Electron there is no keychain, so the token stays plaintext and
`git_token_protected: 0` records that fact rather than pretending otherwise.

An encrypted blob with no reachable keychain — the database moved to another
machine, or a locked keychain — reads as *no token*. It must never fall back to
the raw bytes, which would be pushed at GitHub as if it were a credential.
A value without the `enc:v1:` prefix is read as-is, so a token stored before
this feature existed still works.

### Conflict archive

Before any resolution is written, every involved version is copied to
`notes/.monos/conflict-archive/<note>/`, pruned to 20 files and 90 days.
Resolution must never be the only place a version exists — whichever side the
user drops leaves the tree, the index and the next commit at once.

### What the user is told

The response no longer returns only git's raw output:

| Field | Meaning |
|---|---|
| `committed` | whether this device had anything to commit at all |
| `pushed` | relative paths this device added |
| `pulled` | how many commits came in from the other device |
| `inSync` | whether the branch ended level with the remote |
| `device` | the configured device name |

Commit messages are `Auto-sync from <device name>`. With a single generic
`Auto-sync from Monos`, a shared history gives no way to tell whose edit is whose —
which is the only thing that makes a two-device history readable at all.

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
