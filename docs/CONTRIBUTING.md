# Contributing

Thanks for your interest in Monos. The project is still small, so contributions should stay focused, practical, and easy to review.

## Development Setup

Install dependencies from the repository root:

```bash
npm install
npm --prefix webui/backend install
npm --prefix webui/frontend install
```

Run the backend:

```bash
cd webui/backend
node index.js
```

Run the frontend:

```bash
cd webui/frontend
npm run dev
```

## Conventions

### File layout

- **Components** go in `webui/frontend/src/components/` — one `.svelte` per concern, plus an optional `.test.js` next to it.
- **Pure JS helpers** go in `webui/frontend/src/lib/` — one `feature.js` (or `feature/index.js` for larger features) plus `feature.test.js`.
- **Global state** lives in `webui/frontend/src/stores.js` or its own module under `lib/stores/`.
- **Backend routes** live in `webui/backend/routes/` and are wired up in `webui/backend/index.js`.

### Naming

- `kebab-case.svelte` for components (`quick-note-saved-modal.svelte` → class `QuickNoteSavedModal`).
- `kebab-case.js` for lib modules.
- Reactivity helpers in `lib/stores/persisted.js` use camelCase.
- CSS classes come from Tailwind utilities or `lib/form-field.js`, `lib/modal-button.js`, `lib/note-colors.js` — never hardcode the same style in two places.

### When to put something in `lib/` vs inline

If the snippet is reused in two or more components, or has a non-trivial unit of behavior (parsing, formatting, state derivation), it belongs in `lib/`. Otherwise inline is fine. New helpers should ship with a test in the same commit.

### TDD workflow

Every bug fix and most features go through:

1. **Red** — write a failing test in `lib/foo.test.js` (node:test) or `components/Foo.test.js` (vitest) that captures the desired behavior.
2. **Green** — implement the smallest change that makes the test pass.
3. **Refactor** — clean up while keeping tests green.

Run only the relevant test file while iterating:

```bash
# lib helper
node --test webui/frontend/src/lib/foo.test.js

# component (must run from webui/frontend, svelte plugin loads from project root)
cd webui/frontend && node_modules/.bin/vitest run src/components/Foo.test.js
```

The full suite runs in CI on every push.

### Theme tokens, not raw colors

Components never hardcode hex values. They use CSS variables set by `lib/themes.js`:

```svelte
<!-- good -->
<div class="text-[var(--text-primary)]">...</div>

<!-- bad -->
<div class="text-[#ebdbb2]">...</div>
```

If a new palette color is needed, add it to all six palettes in `lib/themes.js` and lock it down in `lib/themes.test.js`.

### i18n strings, not literals

UI strings live in `lib/strings.js` in both `en` and `ru` blocks. When adding a new string:

```js
// in both en and ru
sidebar: {
  modals: {
    newKey: 'New label',
  },
},
```

Never put a user-facing string directly in a Svelte template.

## Checks Before a Pull Request

Run the checks that match your change:

```bash
npm run check:backend
npm run test:backend
npm run check:frontend
npm run test:frontend
npm run test:scale
npm run build:frontend
```

For desktop packaging changes, also run the platform build available on your OS:

```bash
npm run dist:win
npm run dist:mac
npm run dist:mac:arm64
```

macOS installers should be built on macOS. Windows installers should be built on Windows.

## Notes and Privacy

Do not commit personal note content. The repository intentionally ignores `notes/`; local user data belongs in the app data directory:

- Windows: `%APPDATA%/Monos/MonosData`
- macOS: `~/Library/Application Support/Monos/MonosData`

Use small synthetic notes in tests and fixtures.

## Pull Request Guidelines

- Keep changes scoped to one product or technical concern.
- Add tests for behavior changes. TDD strongly preferred.
- Prefer existing local patterns over new dependencies.
- Avoid UI churn unless the change improves a concrete workflow.
- Keep user data migrations conservative and reversible when possible.
- Run `npm run check` and `npm run test` from the root before opening the PR.
