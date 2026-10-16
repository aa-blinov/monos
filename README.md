# Monos

Monos is a local-first desktop notes app for people who want a fast personal knowledge base without handing their notes to a cloud service.

It combines Markdown files, wiki-style links, a clean dashboard inspired by Google Keep, full-text search, and Git sync into one focused workspace.

[Website](https://aa-blinov.github.io/monos/) · [Downloads](https://github.com/aa-blinov/monos/releases) · [Architecture](docs/ARCHITECTURE.md)

![Monos dashboard with a mock product knowledge base](site/media/monos-dashboard.png)

## Why Monos

- **Local-first by design**: notes live on your machine as plain Markdown files.
- **Desktop-ready**: packaged with Electron for Windows and macOS.
- **Private by default**: user notes are runtime data, not repository content.
- **Markdown plus rich editing**: write naturally, keep portable text files.
- **Wiki links and backlinks**: connect ideas with `[[Note title]]`; links open from the editor, and a link to a note that does not exist yet creates it.
- **Board view**: scan recent notes in a compact, card-based dashboard.
- **Search that understands content**: search titles, tags, and note bodies.
- **Git sync**: optional repository-backed backup and synchronization.

## Install the Desktop App

Download the installer for your system from [Releases](https://github.com/aa-blinov/monos/releases/latest).

**macOS.** Open the `.dmg` and drag Monos to Applications. The app is not notarized by Apple yet, so on first launch macOS says it cannot check the developer. To open it once:

1. Try to open Monos, then close the warning.
2. Open System Settings → Privacy & Security, scroll down and click **Open Anyway** next to the message about Monos.
3. Confirm with your password. Later launches open normally.

Alternatively, in Terminal: `xattr -dr com.apple.quarantine /Applications/Monos.app`.

**Windows.** SmartScreen may show "Windows protected your PC". Click **More info**, then **Run anyway**.

Your notes stay in the app's data folder (see below) and are kept when you install a new version over the old one.

## Desktop Data Location

Monos stores user data in the operating system's standard application data directory:

- **Windows**: `%APPDATA%/Monos/MonosData`
- **macOS**: `~/Library/Application Support/Monos/MonosData`

Inside that directory:

- `notes/` contains user Markdown files and attachments.
- `.data/notes.db` is a rebuildable SQLite index/cache.

The application repository does not ship personal notes.

## Development

### Requirements

- Node.js 22+
- npm
- Git

### Install

```bash
npm install
npm --prefix webui/backend install
npm --prefix webui/frontend install
```

### Run Web UI Locally

Backend:

```bash
cd webui/backend
node index.js
```

Frontend:

```bash
cd webui/frontend
npm run dev
```

The backend runs on `http://localhost:8000`; the frontend dev server runs on `http://localhost:5173`.

### Build Desktop Apps

Windows:

```bash
npm run dist:win
```

macOS:

```bash
npm run dist:mac
```

CI builds both platforms through GitHub Actions and uploads installers as workflow artifacts.

## Versioning

Monos follows [Semantic Versioning](https://semver.org/):

- **MAJOR** versions include breaking changes to note storage, public APIs, sync behavior, or desktop data layout.
- **MINOR** versions add backwards-compatible features, UI improvements, or new settings.
- **PATCH** versions contain backwards-compatible bug fixes, dependency updates, and small polish changes.

Release tags use the `vMAJOR.MINOR.PATCH` format, for example `v1.0.0`.

## Quality Checks

```bash
npm run check:backend
npm run test:backend
npm run check:frontend
npm run test:frontend
npm run test:scale
npm run build:frontend
```

## Documentation

- `docs/ARCHITECTURE.md` explains the system design and the frontend module layout.
- `docs/STATE.md` describes where state lives, who owns it, and how it flows.
- `docs/LIB.md` is a map of every helper in `webui/frontend/src/lib/` and what it's for.
- `docs/FRONTMATTER.md` documents note metadata.
- `docs/CONTRIBUTING.md` covers development workflow and conventions.
- `docs/PUBLISHING.md` documents the release process.
- `docs/ACCESS.md` explains opening Monos from a phone or another computer, and installing it.
- `webui/README.md` describes the web application internals.

## License

[MIT](LICENSE)
