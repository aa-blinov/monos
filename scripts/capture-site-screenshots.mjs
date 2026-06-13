import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const frontendDir = path.join(repoRoot, 'webui', 'frontend');
const outputDir = path.join(repoRoot, 'site', 'media');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-site-'));
const notesDir = path.join(tmpRoot, 'notes');
const backendPort = 8137;
const frontendPort = 5187;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

function writeNote(relativePath, body) {
  const fullPath = path.join(notesDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, body.trimStart(), 'utf-8');
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep waiting until the server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function seedNotes() {
  fs.mkdirSync(notesDir, { recursive: true });

  writeNote('Product/Launch Plan.md', `---
title: "Launch Plan"
tags: ["product", "release", "desktop"]
category: "Product"
---

## Monos 1.0

Ship a calm local-first notes app for people who want ownership, speed, and a clean daily dashboard.

- Package Windows and macOS builds
- Publish the landing page
- Prepare a crisp demo knowledge base

Related: [[Design Principles]]
`);

  writeNote('Product/Design Principles.md', `---
title: "Design Principles"
tags: ["design", "ux", "focus"]
category: "Product"
---

Monos should feel private, quiet, and direct. The UI stays out of the way until it helps the writer move faster.

## Principles

- Local files are the source of truth
- Search should work across title, tags, and body
- Cards should be compact, readable, and predictable
`);

  writeNote('Research/Local-first Apps.md', `---
title: "Local-first Apps"
tags: ["research", "privacy", "sync"]
category: "Research"
---

Local-first software keeps user data available offline and treats sync as an optional layer.

Monos follows this approach with Markdown files, a rebuildable SQLite index, and optional Git sync.
`);

  writeNote('Research/Markdown Workflow.md', `---
title: "Markdown Workflow"
tags: ["markdown", "writing", "portable"]
category: "Research"
---

Markdown keeps notes readable in any editor. Frontmatter adds just enough metadata for filtering without trapping the user in a proprietary format.
`);

  writeNote('Daily/Weekly Review.md', `---
title: "Weekly Review"
tags: ["review", "habits", "planning"]
category: "Daily"
---

## Wins

- Captured product ideas quickly
- Linked research notes back to launch tasks
- Kept the dashboard clean enough to scan at a glance
`);

  writeNote('Ideas/Knowledge Garden.md', `---
title: "Knowledge Garden"
tags: ["ideas", "writing", "links"]
category: "Ideas"
---

A knowledge base should reward small notes. Start with a quick capture, then connect it when the pattern becomes clear.
`);
}

async function main() {
  seedNotes();
  fs.mkdirSync(outputDir, { recursive: true });

  process.env.NOTES_ROOT = tmpRoot;
  process.env.ALLOWED_ORIGINS = frontendUrl;

  const backendModule = await import(pathToFileURL(path.join(repoRoot, 'webui', 'backend', 'index.js')).href);
  await backendModule.startServer({ port: backendPort });

  const viteProcess = spawn(process.execPath, [
    path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    String(frontendPort),
    '--strictPort',
  ], {
    cwd: frontendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_API_URL: backendUrl,
    },
  });

  try {
    await waitForUrl(frontendUrl);

    const playwright = await import(pathToFileURL(path.join(frontendDir, 'node_modules', 'playwright', 'index.js')).href);
    const { chromium } = playwright.default || playwright;
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    await page.addInitScript(() => {
      localStorage.setItem('locale', 'en');
      localStorage.setItem('darkMode', 'true');
      localStorage.setItem('noteView', 'board');
      localStorage.setItem('boardColumns', '3');
      localStorage.setItem('editMode', 'rich');
    });

    await page.goto(frontendUrl);
    await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: 'Notes' }).waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-dashboard.png'), fullPage: false });

    await page.getByPlaceholder('Search').fill('sync');
    await page.getByText('Search Results').waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-search.png'), fullPage: false });

    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    await page.getByTestId('tree-drop-zone').getByRole('button', { name: /Product/i }).first().click();
    await page.getByTestId('tree-drop-zone').getByRole('button', { name: /Launch Plan/i }).first().click();
    await page.locator('input[placeholder="Note Title"]').waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-editor.png'), fullPage: false });

    await page.goto(`${frontendUrl}/settings`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-settings.png'), fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(frontendUrl);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Group by color' }).waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-mobile.png'), fullPage: false });

    await browser.close();
  } finally {
    viteProcess.kill('SIGTERM');
    await backendModule.stopServer();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
