# Monos Playwright E2E

Release smoke tests run against an isolated temporary notes vault. They do not write to the real `notes/` directory.

```bash
npm run test:e2e
npm run test:e2e:headed
```

The suite starts two Playwright `webServer` processes:

- an isolated backend on `E2E_BACKEND_PORT` (default `8120`);
- a Vite frontend on `E2E_FRONTEND_PORT` (default `5178`) pointed at that backend.

Test organization:

- `01-simple.spec.js`: basic release checks such as opening notes, creating a note, and saving settings.
- `02-complex.spec.js`: cross-feature flows such as autosave + search, image attachment rename, and quick note from clipboard.

When adding new release checks, prefer user-visible locators (`role`, `label`, `title`) and keep test data unique via `uniqueTitle()`.
