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
```

macOS installers should be built on macOS. Windows installers should be built on Windows.

## Notes and Privacy

Do not commit personal note content. The repository intentionally ignores `notes/`; local user data belongs in the app data directory:

- Windows: `%APPDATA%/Monos/MonosData`
- macOS: `~/Library/Application Support/Monos/MonosData`

Use small synthetic notes in tests and fixtures.

## Pull Request Guidelines

- Keep changes scoped to one product or technical concern.
- Add tests for behavior changes.
- Prefer existing local patterns over new dependencies.
- Avoid UI churn unless the change improves a concrete workflow.
- Keep user data migrations conservative and reversible when possible.
