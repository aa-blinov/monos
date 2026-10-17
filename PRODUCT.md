# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A public product for a broad audience: anyone with a laptop who wants local notes. Confirmed by the user during init on 2026-10-11.

Consequences that follow from that answer:

- Onboarding, obviousness, and a minimal setup outrank depth and power.
- The audience is **not** assumed to already live in Markdown and Git. Wiki-links, frontmatter, and repository-backed sync must read as ordinary product features, not as machinery for people who already know the tools.
- Consistent behavior across the shipped platforms is part of the experience, not a packaging detail.

## Product Purpose

Monos is a local-first desktop notes app: a personal knowledge base where notes stay on the user's own machine as plain Markdown files.

Success means a person can capture, find, and return to their notes years later — without an account, a subscription, or a service that could change its mind about the data.

## Positioning

The differentiator is the ownership model, not the feature list:

- The Markdown file on disk is the source of truth and the only copy.
- SQLite is a rebuildable cache. It can be deleted at any moment and the notes are still there.
- The `notes/` folder can be carried to any other editor, synced by any other tool, or read in a plain text editor long after the app is gone.

A product that syncs to a vendor account, or stores notes in a proprietary database, cannot truthfully claim that. The public site states it as: *"A calm notes app that does not trap your knowledge."*

## Operating Context

- Shipped as a desktop app through `electron-builder`: NSIS installer on Windows, DMG on macOS. Linux AppImage/deb targets are defined in `package.json` but are not published in CI or in the README's download links.
- On startup, Electron resolves the OS user data directory, starts the Express backend on a random localhost port, serves the built Svelte frontend through it, and opens a BrowserWindow.
- User data lives in the OS application data directory: `%APPDATA%/Monos/MonosData` on Windows, `~/Library/Application Support/Monos/MonosData` on macOS — containing `notes/` (Markdown plus attachments) and `.data/notes.db` (rebuildable index).
- The daily loop: capture a quick note from the sidebar → scan recent notes on the board or list dashboard → edit with wiki-links and backlinks → search across titles, tags, and bodies → adjust settings.
- Git sync is optional and operates on the user's own notes directory, never on the application source repository. Conflict resolution is a first-class screen because the sync is user-driven and can genuinely conflict.
- Distribution: GitHub Releases for installers, GitHub Pages for the public site.
- Interface languages: English and Russian, both first-class.

## Capabilities and Constraints

**Data model**

- Markdown files are the source of truth. SQLite is a cache and index, rebuildable at will. An index update must never be the only copy of user content.
- The frontend talks to the backend over `/api/*`; it never touches the filesystem directly.

**Internationalization**

- `en` and `ru` string trees are written at the same time. There is no fallback to English. A key present in one locale and missing in the other is a bug, and the test suite enforces the parallel key sets.
- Dynamic values are exposed as functions (e.g. `quickNoteWillRenameTo: (target) => ...`).

**Theming**

- Six palettes (gruvbox, github, dracula, nord, solarized, catppuccin), each with light and dark variants, selected through two orthogonal persisted stores: `activeTheme` and `themeMode` (`light` / `dark` / `system`).
- `lib/themes.js` is the single source of token values. Components read CSS variables and never hardcode colors.
- Theme switching sets CSS variables without re-rendering, so it must stay O(1).

**Privacy**

- The codebase contains no accounts, no authentication, no analytics, and no telemetry. Verified by search across the backend and frontend during init.
- The UI opens no network connection of its own: JetBrains Mono is self-hosted from `webui/frontend/public/fonts/` rather than fetched from a CDN. Reintroducing a remote font or asset breaks this property.
- The repository does not ship personal notes; the working-tree `notes/` directory is local runtime data and is excluded from committed content by design.

**Responsiveness**

- Layouts must stay usable from ultrawide desktop down to narrow and mobile widths. A Playwright scale-boundary suite verifies narrow, short, desktop, and ultrawide cases.

**Shipping gates**

- Backend syntax and API/search tests, `svelte-check`, frontend unit tests (vitest + node:test), Playwright scale tests, and the production frontend build all run before a release.
- MAJOR version bumps are reserved for breaking changes to note storage, public APIs, sync behavior, or the desktop data layout. Treat these as user-facing promises, not internal refactors.

**Explicitly undecided**

- Privacy as a standalone marketing or brand commitment was *not* among the priorities the user marked inviolable during init. It is recorded here as a factual property of the build, not as a confirmed brand commitment.

## Brand Commitments

- **Name:** Monos. Identifiers: `app.monos.notes` (appId), `app.monos.notes.desktop` (desktopName).
- **Voice:** calm and plain. The site headline is *"A calm notes app that does not trap your knowledge."* Restraint carries the personality — no exclamation marks, no growth-marketing urgency, no exclamation-marked feature lists.
- **Owned assets:** `build/icon.svg|.png|.icns|.ico`, generated by `scripts/generate-app-icons.mjs`; the landing page `site/index.html` and eight screenshots in `site/media/`.
- **No fabricated proof.** There are no testimonials, user counts, benchmarks, or pricing in the project, and none may be invented for marketing, an About page, or a trust section.
- **No monetization scaffolding.** No accounts, billing, or subscription surfaces exist, and the product record does not anticipate any.

## Evidence on Hand

- Real product screenshots in `site/media/`: dashboard, editor, search, settings, templates, conflicts, mobile.
- A live public site at `site/index.html`, published by `.github/workflows/pages.yml`.
- A working release pipeline: `.github/workflows/desktop-build.yml` builds Windows and macOS installers as workflow artifacts.
- Public bug-report and feature-request issue templates in `.github/ISSUE_TEMPLATE/`.
- Current, maintained documentation in `docs/`: `ARCHITECTURE.md`, `STATE.md`, `LIB.md`, `FRONTMATTER.md`, `CONTRIBUTING.md`, `PUBLISHING.md`, kept honest by `docs/docs-freshness.test.js`.
- **Absent — do not fabricate:** testimonials, customer logos, user numbers, press coverage, performance benchmarks, and pricing claims.

## Device Model and the Agent

Decided by the user on 2026-10-17.

- **Every device is a client with its own copy.** Each computer runs its own Monos over its own notes folder; devices exchange notes only through the user's GitHub repository. There is no Monos server that other devices connect to. A conflict between devices is resolved on the device that meets it (the conflict views), never by a central authority.
- **Monos is AI-native through a local agent.** A terminal panel inside the desktop app runs the user's own CLI agent (Claude Code, Codex, or any command) in the notes folder of that device, so the notes, the agent and its edits are in one window. The agent is treated as one more author on this device: its edits are files like any other, checkpointed before it runs, reviewable and revertible, and they reach the other devices through the same GitHub sync, with commits that say they came from the agent.
- **The terminal never leaves the device.** It lives in the desktop app's main process and talks to the page over a private bridge, with no port and no network route. "Phone and other devices" (opening this computer's notes over Wi-Fi) remains a convenience view of the notes only; it never carries the terminal or the agent.

## Product Principles

1. **The file is the product.** A note must always survive as valid, portable Markdown. Never trade file correctness for index speed, UI convenience, or a nicer preview.
2. **Speed is felt, not claimed.** Open, search, and save must feel immediate. Any added perceptible pause needs a measured justification, not a preference.
3. **Two languages, one product.** `en` and `ru` are written together, key for key, with no fallback. A missing Russian string is a bug, not a deferral.
4. **Plain and calm beat clever.** The interface is a web interface in a window — keep familiar web behavior, and let restraint carry the character.
5. **A broad audience deserves obviousness.** Someone who has never opened a Markdown file must be able to start, find, and trust their notes without a tutorial.

## Accessibility & Inclusion

- Every interface string exists in both `en` and `ru`, including modal and error copy. No message may exist in one locale only.
- The interface works from ultrawide desktop down to mobile widths; responsive behavior is enforced by the `isMobile` derived store and the Playwright scale suite.
- Russian is a first-class locale written by the author, not a machine translation pass.