# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The product ships as a desktop app (Electron 39) whose interface is a web app. The same backend serves the notes to a phone or another computer on the local network, when the person allows that. The Markdown files on disk are the product in every mode.

## Users

The owner confirmed this audience on 2026-10-11: a public product for a broad audience, anyone with a laptop who wants local notes and does not want to hand them to a cloud service.

Three things follow from that answer:

- Onboarding, obviousness and a short setup come before depth and power.
- The audience is not assumed to live in Markdown and Git. Wiki links, frontmatter and repository-backed sync have to read as ordinary things an app does rather than as machinery for people who already know the tools.
- The same behaviour on every shipped platform is part of the experience, not a packaging detail.

There is no second audience. No team, no shared vault and no enterprise edition is described anywhere in the repository, and there is nothing to count: the app is distributed through GitHub Releases, with no download numbers, no accounts and no testimonials.

## Product Purpose

Monos is a local-first desktop notes app. A person writes notes, links them to each other, finds them again later, and can still read every one of them in a plain text editor years afterwards, without an account, a subscription, or a service that may change its mind about the data.

Success for the user is a note that is still there, still readable and still in the same place next year. Success for the product is that the Markdown file on disk is the only copy, and that the index beside it can be thrown away and rebuilt at any time.

## Positioning

A neighbouring notes product stores your notes in a database, on a server, or in a proprietary format, and asks you to trust it with the thing you are thinking. This one writes a Markdown file and stops there.

Three differences a neighbour could not copy without changing what it is:

- **The file is the only copy.** SQLite is a rebuildable cache. Deleting `notes.db` costs a reindex and nothing else.
- **The folder can leave.** `notes/` can be opened in any editor, put under any other version control, or copied somewhere else. Monos never moves notes between folders and never writes to a folder it did not open.
- **Sync is the person's own repository.** The notes folder is the git repository. There is no Monos account, no Monos server and no Monos copy of anything.

The public site states it as: "A calm notes app that does not trap your knowledge."

## Operating Context

- Distribution goes through `electron-builder`: an NSIS installer on Windows, a DMG on macOS, and an AppImage and a deb on Linux. The release workflow builds all four and attaches them to the GitHub release.
- On startup the Electron main process resolves the operating system's application data directory, starts the Express backend on a random free port, serves the built Svelte frontend through it, and opens a BrowserWindow at that address.
- User data lives in `%APPDATA%/Monos/MonosData` on Windows and `~/Library/Application Support/Monos/MonosData` on macOS: `notes/` with the Markdown files and the attachments, and `.data/notes.db` with the index.
- The daily loop: take a quick note from the sidebar, scan recent notes on the board, edit with wiki links and backlinks, search across titles, tags and bodies, and adjust the settings.
- Git sync is optional and operates on the person's own notes folder, never on the application source repository. Conflict resolution is a first-class screen, because the sync is user-driven and two devices really can disagree.
- The agent terminal runs on the device that holds the notes. It is a shell in the desktop app's main process, the page reaches it through a preload bridge, and the backend has no terminal route. The Wi-Fi view carries notes only.
- Distribution of the software: GitHub Releases for the installers, GitHub Pages for the landing page.
- The interface ships in English and Russian, both complete.

## Capabilities and Constraints

**Data model**

- Markdown files are the source of truth. The SQLite index is a cache and can be rebuilt from the folder at any moment, so an index update is never the only copy of anything.
- The frontend talks to the backend over `/api/*` and never touches the filesystem.
- Every notes folder gets its own index file, so switching folders does not mix two vaults.

**Internationalization**

- The `en` and `ru` string trees are written at the same time. There is no fallback to English, and a test compares the two key sets.
- A key that exists in one locale and not in the other is a bug.

**Theming**

- Six palettes (gruvbox, github, dracula, nord, solarized, catppuccin), each in a light and a dark variant, chosen through two persisted stores: the palette and the mode (`light`, `dark`, `system`).
- `lib/themes.js` holds the token values. Components read CSS variables and never hardcode a colour.
- Switching the theme sets CSS variables without a re-render, so it stays constant time.
- The two secondary text steps, `--text-secondary` and `--text-tertiary`, are held to 4.5:1 on every surface where they are used, and a test measures that for all six palettes in both modes.

**Privacy**

- No accounts, no authentication, no analytics, no telemetry.
- The interface opens no network connection of its own. JetBrains Mono is shipped in the repository rather than fetched from a CDN, and a remote font or asset would break that property.
- The repository carries no personal notes. The `notes/` directory is runtime data.

**Search**

- SQLite FTS5 with a trigram tokenizer, so a query matches inside a word: `сеть` finds «подсеть».
- A search returns at most 50 results, and the interface does not say that more existed.

**Performance**

- The backend runs inside the desktop app's main process, so a slow route is a frozen window. Measured on a vault of 5,300 notes, a full index at startup went from 28 s to 6 s, and to 0.5 s once the index exists. A sync still holds the main thread for about 0.2 s, and a pull of 300 changed notes for about 0.5 s.

**Shipping gates**

- Backend syntax and API tests, `svelte-check`, the frontend unit tests, the Playwright suite and the production frontend build all run before a release.
- A MAJOR version bump is reserved for a breaking change to note storage, the public API, the sync behaviour or the desktop data layout.

**Not true today**

- The app is not notarized and not code-signed. macOS and Windows both ask once on the first launch.
- There is no automatic update.
- The network access for a phone is plain HTTP, so it is only safe on a network the person trusts. Monos serves no HTTPS of its own.
- Installing on a real phone has not been tested; the manifest and the icons were checked in browser emulation only.
- The conflict copies that another sync service leaves beside a note are listed, not merged, and each one is kept or deleted by hand.

## Brand Commitments

- **Name:** Monos. The identifiers are `app.monos.notes` (appId) and `app.monos.notes.desktop` (desktopName).
- **Voice:** calm and plain. The headline is "A calm notes app that does not trap your knowledge." Restraint carries the personality: no exclamation marks, no urgency, no marketing voice.
- **Owned assets:** the application icon in `build/`, generated by `scripts/generate-app-icons.mjs`, and the landing page with its eight screenshots in `site/`.
- **No fabricated proof.** There are no testimonials, user counts, benchmarks or prices in the project, and none may be invented for an About page or a trust section.
- **No monetization scaffolding.** No accounts, billing or subscription surfaces exist, and the product record does not anticipate any.

## Evidence on Hand

- Real screenshots in `site/media/`: dashboard, editor, search, quick switcher, settings, templates, conflicts and a narrow window.
- A live landing page in `site/index.html`, published by `.github/workflows/pages.yml`.
- A working release pipeline: `.github/workflows/desktop-build.yml` builds the Windows, macOS and Linux installers and attaches them to a GitHub release.
- Issue forms for bug reports and feature requests in `.github/ISSUE_TEMPLATE/`.
- Maintained documentation in `docs/`, kept honest by `docs/docs-freshness.test.js`, which also fails when a module in `webui/frontend/src/lib/` has no test.
- Test suites that run in CI: the backend on `node:test`, the frontend on `node:test` and vitest, and 54 Playwright spec files.
- **Absent, and not to be invented:** testimonials, customer logos, user numbers, press coverage, performance claims beyond the measured figures above, and pricing.

## Product Principles

1. **The file is the product.** A note must survive as valid, portable Markdown at every moment. Never trade file correctness for index speed, interface convenience or a nicer preview.
2. **Speed is felt, not claimed.** Opening, searching and saving have to feel immediate, and any pause a person can notice needs a measured reason behind it.
3. **Two languages, one product.** English and Russian are written key for key, with no fallback. A missing Russian string is a defect, not a deferral.
4. **Plain and calm beat clever.** The interface is a web interface in a window. Familiar web behaviour, and restraint carries the character.
5. **A broad audience deserves obviousness.** Someone who has never opened a Markdown file must be able to start, find and trust their notes without a tutorial.

## Accessibility & Inclusion

- Every interface string exists in both English and Russian, including the modal and error copy.
- The interface works from an ultrawide desktop down to a narrow window. The responsive behaviour is enforced by the `isMobile` derived store and by the Playwright scale-boundary suite, which covers narrow, short, desktop and ultrawide sizes.
- The two secondary text steps of every palette are held to WCAG AA at 4.5:1 on every surface where they appear, and a test measures each pair, so a theme cannot drift below the bar without a red build.
- Russian was written by the author rather than translated by a machine.

Open, and worth stating plainly: there is no accessibility statement, the phone installation has not been tried on real hardware, and the printed output has a palette of its own, so it does not match the interface exactly.
