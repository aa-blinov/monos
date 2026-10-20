# AGENTS.md — agent context for `monos`

A local-first desktop notes app: an Electron shell, a Node API, a Svelte interface, and a folder of Markdown files that holds the only copy of the user's notes. This file is what you need to work on the project without reading all of it.

## Run / build / test

```bash
npm install                          # the Electron shell and the shared dependencies
npm --prefix webui/backend install   # better-sqlite3, built for plain Node
npm --prefix webui/frontend install  # Svelte, Vite, Tailwind, TipTap, Playwright

cd webui/backend && node index.js    # the API on http://127.0.0.1:8000
cd webui/frontend && npm run dev     # the interface on http://localhost:5173

npm run check:backend                # node --check on six backend files
npm run test:backend                 # node --test over the backend
npm run check:frontend               # svelte-check
npm run test:frontend                # node --test for lib/, vitest for the components
npm run test:e2e                     # Playwright, 54 spec files
npm run build:frontend               # the production bundle
npm run electron:dev                 # the desktop app, with the frontend built first
npm run dist:mac                     # a .dmg
npm run dist:win                     # an .exe
npm run acceptance                   # a real session in a real window
```

Node 22. In development the backend and the frontend are two separate processes; in the packaged app the backend runs inside the Electron main process and serves the built frontend from it.

The tests sit next to what they cover. `lib/foo.js` goes with `lib/foo.test.js` and runs on `node:test`, `components/Foo.svelte` goes with `components/Foo.test.js` and runs on vitest. One file at a time:

```bash
node --test webui/frontend/src/lib/foo.test.js
cd webui/frontend && node_modules/.bin/vitest run src/components/Foo.test.js
```

## Where things live

| Path | What it holds |
| --- | --- |
| `electron/main.cjs` | The window, the backend process, the flush on close, the quit sequence. |
| `electron/terminal.cjs` | The node-pty shells and the IPC the page may use. |
| `electron/preload.cjs` | The only bridge to the terminal. Sandboxed, no Node of its own. |
| `webui/backend/index.js` | The Express app and the route registration. |
| `webui/backend/routes/` | One file per group of endpoints. |
| `webui/backend/database.js` | The SQLite schema and the connection. |
| `webui/backend/search.js` | The ranking, the excerpts and the query parsing. |
| `webui/backend/fts.js` | The FTS5 index over the notes. |
| `webui/backend/watcher.js` | Watches the folder and announces what changed. |
| `webui/backend/notes-folder.js` | The folder the person chose, and its own index. |
| `webui/frontend/src/App.svelte` | The composition root and the cross-feature state. |
| `webui/frontend/src/stores.js` | The global stores. |
| `webui/frontend/src/components/` | One component per concern. |
| `webui/frontend/src/lib/` | The pure helpers, the API client, the strings, the themes. |
| `webui/frontend/e2e/` | The Playwright suite. |
| `clipper/` | The browser extension. |
| `site/` | The landing page and its screenshots. |
| `scripts/` | The checks, the icon generator, the acceptance run. |
| `docs/` | The architecture, the state model, the release process. |

## Traps

- **The backend loads its dependencies from the root `node_modules`.** `webui/backend/package.json` holds only `better-sqlite3`, because that one is compiled and has to match the runtime that loads it: the tests run on plain Node with the copy in `webui/backend/node_modules`, the app runs on Electron with the copy in the root. `npm run check:deps` fails when a runtime dependency is missing from the root file, and CI runs it. A new backend dependency goes into the root `package.json` too.
- **`webui/run.sh` and `pyproject.toml` are leftovers.** The project was a Python app with a FastAPI backend once. `run.sh` installs `requirements.txt` and starts `uvicorn`, and neither exists now; `pyproject.toml` carries the mdformat, ruff and pre-commit tooling the hooks use, and a `tui` group for a text interface that was never built. There is no Python in the application.
- **The last line of `docs/CONTRIBUTING.md` names two scripts that do not exist.** It asks for `npm run check` and `npm run test` from the root. The root has `check:backend`, `check:frontend`, `test:backend`, `test:frontend` and `test:e2e`. Run the ones that exist.
- **The file is the truth and the index is a cache.** Every write goes to the Markdown file first. `notes.db` can be deleted and rebuilt from the folder, so an index update is never the only copy of anything. `indexAllFiles` skips a note the index already holds, comparing text, modification time and place, which means a file changed outside the app is picked up by the watcher rather than by the index.
- **The FTS index uses a trigram tokenizer, and the ranking lives in `search.js`.** The first version used `unicode61`, which indexes whole words and silently dropped `сеть` for «подсеть» and `rag` for «fragment». The tokenizer is the reason a search matches inside a word, and the score and the excerpts are still computed in `search.js` over the rows the index returns.
- **The port is not a constant in the packaged app.** `electron/main.cjs` starts the backend with `{ port: 0 }` and reads the port back, then sets `ALLOWED_ORIGINS` afterwards, because the port is known only once the server binds. `appOrigins` reaches the clipper routes as a function for the same reason: a list captured at registration time left the development defaults in place and made a packaged app refuse its own origin.
- **The terminal does not go through the API.** It lives in the Electron main process under node-pty, and the page reaches it only through `electron/preload.cjs`, which exposes `window.monosTerminal`. The backend has no terminal route, and the window the app opens for printing gets no preload at all. A terminal route in the backend would put a shell on the network.
- **A sync commits before it pulls.** `/api/git/sync` stages and commits locally, then pulls, then pushes. The other order fails outright when both devices changed the same note, because git refuses to pull into uncommitted local changes. That is the exact case the sync exists for.
- **Network git goes through `gitExecAsync`.** The backend runs inside the main process, so a synchronous `fetch`, `pull` or `push` freezes the window, the terminal and every request for the length of the round trip. Only quick local git calls, such as status, add, commit and rev-parse, stay on the synchronous `gitExec`.
- **A new file under `webui/frontend/src/lib/` needs two things.** A sibling `foo.test.js`, and a line in `docs/LIB.md`. `node --test docs/docs-freshness.test.js` fails on a module without a test or on a module the map does not mention, and CI runs that file.
- **Two locales, no fallback.** Every string in `webui/frontend/src/lib/strings.js` exists in the `en` and in the `ru` block, and a test compares the key sets. A key in one block only fails the suite.
- **Theme values come from `lib/themes.js`.** Components read CSS variables and never hardcode a colour. A size is written `text-[length:var(--text-whisper)]`, because Tailwind reads a bare `var()` as a colour, and a literal `px` size ignores the interface size setting.

## Style / safety rails

- **A note is valid, portable Markdown at every moment.** Never trade the file for index speed, a preview or a convenience.
- **The frontend never touches the disk.** It calls the API.
- **Both locales, always.** There is no fallback to English.
- **No remote assets.** The font is shipped in the repository for that reason, and no telemetry, account or analytics surface exists.
- **No personal notes in the repository.** The `notes/` folder is runtime data.
- **Comments explain why, never what.**
- **A new dependency is a new thing in the shipped app.** The desktop build copies the root `node_modules` into the artefact, so weigh one before adding it.

## Where the product truth lives

`PRODUCT.md` holds it. Read it before changing the behaviour of the app, and write the change there when the behaviour changes.
