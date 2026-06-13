import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
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

## Monos desktop builds

Ship a calm local-first notes app for people who want ownership, speed, and a clean daily dashboard.

- Package Windows, macOS Apple Silicon, macOS Intel, and Linux builds
- Publish the landing page
- Verify Git sync and conflict resolution

Related: [[Design Principles]]
`);

  writeNote('Product/Design Principles.md', `---
title: "Design Principles"
tags: ["design", "ux", "focus"]
category: "Product"
---

Monos should feel private, quiet, and direct. The UI stays out of the way until it helps the writer move faster.

## Principles

- Local Markdown files are the source of truth
- Search should work across title, tags, and body
- Cards should be compact, readable, colored, and predictable
`);

  writeNote('Product/Release Checklist.md', `---
title: "Release Checklist"
tags: ["release", "github", "builds"]
category: "Product"
---

## Packages

- Windows installer
- macOS Apple Silicon DMG
- macOS Intel DMG
- Ubuntu DEB
- Linux AppImage
`);

  writeNote('Research/Local-first Apps.md', `---
title: "Local-first Apps"
tags: ["research", "privacy", "sync"]
category: "Research"
---

Local-first software keeps user data available offline and treats sync as an optional layer.

Monos follows this approach with Markdown files, a rebuildable SQLite index, and optional Git sync.

When sync conflicts happen, Monos shows local and remote versions side by side before resolving.
`);

  writeNote('Research/Sync Conflict.md', `---
title: "Sync Conflict"
tags: ["sync", "conflict", "git"]
category: "Research"
---

Base version for a sync conflict demo.
`);

  writeNote('Research/Markdown Workflow.md', `---
title: "Markdown Workflow"
tags: ["markdown", "writing", "portable"]
category: "Research"
---

Markdown keeps notes readable in any editor. Frontmatter adds just enough metadata for filtering without trapping the user in a proprietary format.
`);

  writeNote('Research/Import Export.md', `---
title: "Import Export"
tags: ["backup", "zip", "recovery"]
category: "Research"
---

Export creates one ZIP archive of the visible notes tree. Import merges a ZIP into the current hierarchy without overwriting existing files.
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

  writeNote('Templates/Weekly Planning Template.md', `---
title: "Weekly Planning Template"
tags: ["templates", "planning"]
category: "Templates"
---

Custom templates can include placeholders like {{title}}, {{date}}, {{shortDate}}, and {{time}}.
`);

  writeNote('Ideas/Knowledge Garden.md', `---
title: "Knowledge Garden"
tags: ["ideas", "writing", "links"]
category: "Ideas"
---

A knowledge base should reward small notes. Start with a quick capture, then connect it when the pattern becomes clear.
`);

  const templateSettingsDir = path.join(notesDir, '.monos');
  fs.mkdirSync(templateSettingsDir, { recursive: true });
  fs.writeFileSync(path.join(templateSettingsDir, 'templates.json'), JSON.stringify({
    customTemplates: [
      {
        id: 'custom-site-launch',
        title: 'Launch Retro',
        description: 'A reusable retrospective template for releases and product experiments.',
        category: 'Product',
        tags: ['release', 'retro'],
        content: '# {{title}}\n\nDate: {{date}}\n\n## What shipped\n- \n\n## Signals\n- \n\n## Follow-ups\n- [ ] ',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    hiddenLibraryTemplateIds: [],
  }, null, 2), 'utf-8');
}

function git(args) {
  return execFileSync('git', args, {
    cwd: notesDir,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

function seedGitConflict() {
  const conflictPath = path.join(notesDir, 'Research', 'Sync Conflict.md');
  const remoteDir = path.join(tmpRoot, 'remote.git');
  git(['init']);
  git(['checkout', '-B', 'master']);
  git(['config', 'user.name', 'Monos Site']);
  git(['config', 'user.email', 'site@monos.local']);
  git(['add', '-A']);
  git(['commit', '-m', 'Seed site notes']);
  execFileSync('git', ['init', '--bare', remoteDir], { encoding: 'utf-8', stdio: 'pipe' });
  git(['remote', 'add', 'origin', remoteDir]);
  git(['push', '-u', 'origin', 'master']);

  git(['checkout', '-b', 'remote-conflict']);
  fs.writeFileSync(conflictPath, `---
title: "Sync Conflict"
tags: ["sync", "conflict", "git"]
category: "Research"
---

Remote version keeps the incoming Git history from another device.
`, 'utf-8');
  git(['add', 'Research/Sync Conflict.md']);
  git(['commit', '-m', 'Remote sync conflict version']);

  git(['checkout', 'master']);
  fs.writeFileSync(conflictPath, `---
title: "Sync Conflict"
tags: ["sync", "conflict", "git"]
category: "Research"
---

Local version keeps the current device edits before syncing.
`, 'utf-8');
  git(['add', 'Research/Sync Conflict.md']);
  git(['commit', '-m', 'Local sync conflict version']);

  try {
    git(['merge', 'remote-conflict']);
  } catch {
    // The conflict is intentional so the website can show the resolver UI.
  }
}

async function main() {
  seedNotes();
  seedGitConflict();
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
    await page.getByRole('button', { name: /^\+\s*New note$/i }).waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-dashboard.png'), fullPage: false });

    await page.getByPlaceholder('Search').fill('sync');
    await page.getByText('Search Results').waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-search.png'), fullPage: false });

    const openSidebar = page.getByRole('button', { name: 'Open sidebar' });
    if (await openSidebar.isVisible()) await openSidebar.click();
    await page.getByTestId('tree-drop-zone').getByRole('button', { name: /Product/i }).first().click();
    await page.getByTestId('tree-drop-zone').getByRole('button', { name: /Launch Plan/i }).first().click();
    await page.locator('input[placeholder="Note Title"]').waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-editor.png'), fullPage: false });

    await page.goto(`${frontendUrl}/templates`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: 'Templates', exact: true }).waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-templates.png'), fullPage: false });

    await page.goto(`${frontendUrl}/settings`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await page.getByRole('button', { name: 'View Conflicts' }).waitFor();
    await page.getByRole('button', { name: 'View Conflicts' }).click();
    await page.getByRole('button', { name: 'Resolve Conflicts' }).waitFor();
    await page.getByRole('button', { name: 'Resolve Conflicts' }).click();
    await page.getByRole('dialog').getByText('Research/Sync Conflict.md').waitFor();
    await page.screenshot({ path: path.join(outputDir, 'monos-conflicts.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await page.getByText('Backup', { exact: true }).scrollIntoViewIfNeeded();
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
