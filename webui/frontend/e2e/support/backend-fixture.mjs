import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const port = Number(process.env.E2E_BACKEND_PORT || 8120);
const allowedOrigin = process.env.E2E_ALLOWED_ORIGIN || 'http://127.0.0.1:5178';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-e2e-'));
const notesDir = path.join(root, 'notes');

function writeNote(relativePath, content) {
  const fullPath = path.join(notesDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trimStart(), 'utf-8');
}

fs.mkdirSync(notesDir, { recursive: true });
writeNote('Welcome.md', `---
title: "Welcome"
tags: ["release", "smoke", "mobile", "design", "review", "archive"]
---

Welcome to Monos.
This seeded note helps release smoke tests verify navigation and search.
`);
writeNote('Work/Alpha.md', `---
title: "Alpha"
tags: ["work"]
---

Alpha links to [[Welcome]] and mentions release checks.
`);
writeNote('Quick Notes/Seed.md', `---
title: "Seed"
tags: []
---

Seed quick note.
`);

try {
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
} catch {
  // Git-backed settings are not required for e2e smoke coverage.
}

process.env.NOTES_ROOT = root;
process.env.ALLOWED_ORIGINS = allowedOrigin;

const { startServer, stopServer } = await import('../../../backend/index.js');
await startServer({ port });
console.log(`MONOS_E2E_BACKEND_READY ${root}`);

async function shutdown() {
  await stopServer();
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

setInterval(() => {}, 1 << 30);
