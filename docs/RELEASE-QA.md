# Before a release: QA

Run these in order on the commit that will be released. Everything passes, or the release waits. The release itself
(version bump, tag, publishing) is a separate step and only after this list is green.

| # | Check | Command | What it proves |
|---|-------|---------|----------------|
| 1 | Static checks | `npm run check:backend` and `npm run check:frontend` | The backend parses; Svelte and its a11y checks are clean (0 errors, 0 warnings) |
| 2 | Backend tests | `npm run test:backend` | API, indexing, search, sync (two devices over a local remote), conflicts, the assistants' skill. Two live GitHub tests are skipped without a token |
| 3 | Frontend tests | `npm run test:frontend` | Pure logic, components, the design-token guards (contrast of every palette, no dashes, icon scale) |
| 4 | Docs | `node --test docs/docs-freshness.test.js` | Every `lib/` module is in `docs/LIB.md` and the docs name what exists |
| 5 | End to end | `npm run test:e2e` | The Playwright journeys in a browser: board, notes, editor, tags, map, settings, sync settings, hotkeys, accessibility, phone widths |
| 6 | Live sync | `gh workflow run live-github.yml` and read the run | Connect, push and pull against real GitHub with a throwaway branch (the token lives in CI only) |
| 7 | Package | `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --dir --publish never` | The app packs, with `better-sqlite3` and `node-pty` unpacked beside the archive |
| 8 | Acceptance on the package | `npm run acceptance -- --app release/mac-arm64/Monos.app` | A clean install, one real session and a restart, in the packaged app (below) |
| 9 | Performance | see below | Start, the board on a big vault, the map, and the guard that sync never freezes the window |

## The acceptance run

`scripts/acceptance.mjs` drives the real window (the dev app, or a package with `--app`) as a person would, on a clean
user-data folder, and exits 1 naming the step that failed. It checks, in order: the install opens on "Where to start";
the assistants' skill is written and hidden from the notes; a first note is created, typed into and saved by itself;
two notes that link to each other show their relation and appear on the map; ⌘K finds a note; ⌘N, Esc and ⌘B; the
theme changes the whole page; the Help has its key table; the terminal opens and runs `echo`; a phone-sized window
stays usable; after quitting and starting again the notes, links and map are intact; and the console stayed free of
errors throughout. Screenshots of each stage go to the folder given with `--shots`.

## Performance

Measured in the real app, on this machine, against the last release (compare like with like; the numbers move with the
machine's load, so repeat before believing one bad run):

- **Start**: the board's first cards on a 100-note vault, median of 7 starts (about 290 ms for 1.4.7; a candidate within
  roughly 10% is the same). Open a note: about 100 ms.
- **A big vault** (about 5000 notes): the board's page of notes in under 20 ms, tag filter and counts under 20 ms,
  scroll frames at 8.3 ms with none over 33 ms.
- **The map** (3000 linked notes, 2500 drawn): data in about 21 ms, no main-thread stall over 50 ms while it lays out,
  pan and zoom at 8.3 ms per frame.
- **Sync never freezes the window**: `webui/backend/git-sync-nonblocking.test.js` holds a real network wait and checks
  the event loop stays free. It measures its own process's timer lag, so it can fail when the whole computer is
  starved of CPU (load above 30); run it alone before calling that a regression.

## Not covered by a script

Signing and notarisation of the DMG, installing over the previous version and keeping the person's notes, Windows and
Linux packages, and connecting a real GitHub account through the buttons (the live test goes through the API). Do those
by hand on the machines that matter.
