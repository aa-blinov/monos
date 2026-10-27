# State Management

Where state lives, who owns it, and how it flows.

## The Big Picture

Monos uses three state tiers, deliberately:

| Tier | Where | Survives reload? | Owner |
|------|-------|------------------|-------|
| Global persisted | `stores.js` → `localStorage` | yes | global |
| Global ephemeral | `stores.js` → `writable()` | no | global |
| Per-feature | component-local `let` | no | the component |
| Cross-feature | `App.svelte` exports via events | no | `App.svelte` |

If you find yourself reaching for a fourth tier, that's a smell — pick the closest existing one.

## Global Persisted Stores (`stores.js`)

Every store that should survive a page reload uses `persisted(key, default, opts?)` from `lib/stores/persisted.js`. The wrapper:

- reads `localStorage[key]` on first subscription
- writes back on every update
- supports `serialize` / `deserialize` (e.g. for booleans, JSON, etc.)
- supports `migrate` to upgrade older key shapes without a one-time migration script

Current persisted stores:

| Store | Default | Notes |
|-------|---------|-------|
| `activeTheme` | `'gruvbox'` | palette name |
| `themeMode` | `'system'` (in `localStorage`) | `light` / `dark` / `system`; legacy `darkMode` boolean is migrated on first read |
| `fontFamily` | `'Medeo Sans'` | |
| `fontSize` | `'medium'` | UI font scale |
| `lineHeight` | `'normal'` | |
| `editorFontSize` | `'md'` | editor-only override |
| `noteView` | `'board'` | `board` / `list` |
| `boardColumns` | `'3'` | |
| `boardGroupByColor` | `false` | boolean via `serialize`/`deserialize` |
| `outlineHidden` | `false` | desktop only: the editor's outline column is folded into a rail; boolean via `serialize`/`deserialize` |
| `contentWidth` | `'wide'` | has a `migrate` function for a 1.x → 1.2 transition |

Adding a new persisted store: define it in `stores.js` next to the others, document it here.

## Global Ephemeral Stores

A few writable stores are intentionally **not** persisted:

- `editorState` — the currently open file path and dirty status
- `isMobile` — derived from `window.matchMedia`, reset on reload
- `route` — current page (managed by `svelte-spa-router`)

These are constructed in `stores.js` as plain `writable(initial)` and never read from `localStorage`.

## Per-Feature State

Most components keep their own state locally:

- `Sidebar.svelte` owns the tree, expanded folders, and the search query.
- `Editor.svelte` owns the draft, current attachments, and the in-flight save.
- `NoteBoard.svelte` owns its hover/scroll position.
- `Settings.svelte` owns the dirty flag for the settings form.

This is intentional. A feature's state should be readable in one file, with no `store.update()` spread across the codebase.

## Cross-Feature State

Some state genuinely needs to be shared (e.g. "the currently open file" affects the editor, the sidebar selection, the back button, and the title bar). That state lives in `App.svelte` as plain `let` declarations and is passed down as props.

Components that need to mutate cross-feature state dispatch a CustomEvent upward (`on:event={handler}` in the parent). Examples:

- `on:navigate={handleNavigate}` — the editor wants the router to open a different file
- `on:quickNoteSaved={(e) => savedQuickNote = e.detail}` — sidebar announces a saved quick note
- `on:fileDeleted={() => showDashboard({ refreshTree: true })}` — editor wants the dashboard refreshed

### Why events, not stores

A shared store would work, but events have one big advantage: the parent gets a chance to validate, debounce, or log. A new contributor reading the parent component sees the full set of actions it can take in one place.

### When events stop scaling

If a feature has more than three cross-cutting actions, consider extracting a small controller module. Today the main candidate is the "open file" flow — `handleNavigate` lives in `App.svelte` but if it grows much more, it should move to `lib/navigation.js`.

## Sidebar as a Public API

`Sidebar.svelte` is the one component that exposes methods upward through `export function ...`. This is the only case where we reach across the component tree without an event:

```js
// App.svelte
let sidebarComponent;
async function onSomething() {
  await sidebarComponent.loadTree();
  sidebarComponent.setSelected(path);
}
```

The exposed API is intentionally tiny — `loadTree()`, `loadDirectories()`, `setSelected(path)`. If you need a new method, add it to `Sidebar.svelte`'s `<script>` and document it here.

## Adding a New Store: Checklist

1. Pick the tier. Default to per-feature; promote to global only when two components genuinely need the same data.
2. If persisted, use `persisted()` from `lib/stores/persisted.js`.
3. Document the key in the table above.
4. Add a one-line test in `lib/stores/persisted.test.js` if you exercised a new option (`migrate`, custom `serialize`, etc.).
5. Do not write to `localStorage` directly from a component. Always go through the store.
