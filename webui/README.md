# Monos Web UI

The web UI contains the local API and Svelte application used by the Electron desktop app.

## Stack

- **Backend**: Node.js, Express, better-sqlite3
- **Frontend**: Svelte 4, Vite, Tailwind CSS, TipTap
- **Database**: SQLite cache/index
- **Notes**: Markdown files in the runtime `notes/` directory

## Local Development

Install dependencies:

```bash
npm --prefix backend install
npm --prefix frontend install
```

Start the backend:

```bash
cd backend
node index.js
```

Start the frontend:

```bash
cd frontend
npm run dev
```

The frontend proxies `/api/*` requests to `http://localhost:8000`.

## Backend

The backend provides:

- file tree and note CRUD
- Markdown formatting
- full-text search
- backlinks and wiki link resolution
- recent notes and board ordering
- attachment uploads
- settings persistence
- optional Git sync

Relevant files:

- `backend/index.js`: Express app and route registration
- `backend/indexing.js`: filesystem indexing
- `backend/database.js`: SQLite schema and connection
- `backend/search.js`: search ranking and frontmatter parsing
- `backend/routes/`: API route groups

## Frontend

The frontend provides:

- responsive shell and navigation
- board/dashboard view
- editor and rich formatting toolbar
- search panel and highlighted results
- settings and Git configuration
- mobile and desktop layouts

Relevant files:

- `frontend/src/App.svelte`: application shell
- `frontend/src/components/`: UI components
- `frontend/src/lib/`: shared helpers and API wrappers
- `frontend/e2e/`: Playwright tests

## Checks

From the repository root:

```bash
npm run check:backend
npm run test:backend
npm run check:frontend
npm run test:frontend
npm run test:scale
```
