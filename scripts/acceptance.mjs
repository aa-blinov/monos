#!/usr/bin/env node
// Acceptance run of Monos as a person meets it: a clean install, one real session in the app itself (the dev app,
// or a packaged one: `--app release/mac-arm64/Monos.app`), then a restart. One story, in order, each step a
// sentence of what the person does and sees. It is slow on purpose (a real window, a real shell) and runs before a
// release, next to the unit and e2e suites; it exits 1 when a step fails and says which.
//
//   node scripts/acceptance.mjs [--app <path to Monos.app or the binary>] [--shots <folder>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'webui', 'frontend', 'package.json'));
const { _electron: electron } = require('@playwright/test');

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
const appArg = option('--app');
const shots = option('--shots') || fs.mkdtempSync(path.join(os.tmpdir(), 'monos-acceptance-'));
fs.mkdirSync(shots, { recursive: true });

function launchTarget() {
  if (!appArg) return { executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'), prefix: [root], label: 'dev app' };
  const full = path.resolve(appArg);
  const binary = full.endsWith('.app') ? path.join(full, 'Contents', 'MacOS', 'Monos') : full;
  assert.ok(fs.existsSync(binary), `no app at ${binary}`);
  return { executablePath: binary, prefix: [], label: `packaged ${path.basename(full)}` };
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-acceptance-ud-'));
const notesDir = path.join(userData, 'MonosData', 'notes');
const errors = [];
const results = [];
let app;
let win;

async function launch() {
  const target = launchTarget();
  app = await electron.launch({ executablePath: target.executablePath, args: [...target.prefix, `--user-data-dir=${userData}`], cwd: root });
  win = await app.firstWindow();
  win.on('pageerror', (error) => errors.push(`pageerror: ${String(error).slice(0, 300)}`));
  win.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`); });
  await win.waitForSelector('main', { timeout: 60000 });
  await win.waitForTimeout(1500);
  return target.label;
}

async function size(width, height) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setSize(w, h), [width, height]);
  await win.waitForTimeout(700);
}

const shot = (name) => win.screenshot({ path: path.join(shots, `${name}.png`) });
const notesOnDisk = () => {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full); else if (entry.name.endsWith('.md')) found.push(full);
    }
  };
  if (fs.existsSync(notesDir)) walk(notesDir);
  return found;
};
const poll = async (check, what, timeout = 15000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out: ${what}${last ? ` (${last.message})` : ''}`);
};

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ok   ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
    try { await shot(`FAIL-${results.length}`); } catch { /* the window may be gone */ }
  }
}

// The card whose title starts with the name (another note's excerpt may quote the name too).
const card = (name) => win.locator('main [role=list] button').filter({ hasText: new RegExp(`^\\s*${name}`, 'i') }).first();
const api = (route, init) => win.evaluate(async ([url, options]) => {
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json().catch(() => null) };
}, [route, init]);
const makeNote = (title, content) => api('/api/notes/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category: '', tags: [], content }) });
const mod = 'Meta';

console.log(`Monos acceptance, ${launchTarget().label}. Screenshots: ${shots}`);
fs.mkdirSync(notesDir, { recursive: true });
const label = await launch();

await step('a clean install opens on "Where to start"', async () => {
  await win.evaluate(async () => {
    localStorage.setItem('locale', 'en');
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'en', themeMode: 'light' }) });
  });
  await win.reload();
  await win.waitForSelector('main');
  await size(1360, 880);
  const welcome = win.getByTestId('first-run-welcome');
  await welcome.waitFor({ timeout: 15000 });
  assert.match(await welcome.innerText(), /Where to start/);
  assert.equal(notesOnDisk().length, 0, 'a clean install holds no notes');
  await shot('01-welcome');
});

await step('the assistants\' guide is already in the folder, hidden from the notes', async () => {
  const skill = path.join(notesDir, '.claude', 'skills', 'monos-notes', 'SKILL.md');
  await poll(() => fs.existsSync(skill), 'SKILL.md is written at start');
  assert.match(fs.readFileSync(skill, 'utf-8'), /^---\nname: monos-notes/);
  assert.equal(notesOnDisk().length, 0, 'the skill is not a note');
  assert.equal(fs.existsSync(path.join(notesDir, 'AGENTS.md')), false, 'the rule files wait to be asked for');
});

await step('write a first note: it is created, typed into, and saved by itself', async () => {
  await win.getByTestId('first-run-welcome').getByRole('button', { name: 'New note' }).click();
  const dialog = win.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('textbox').first().fill('Acceptance note');
  await win.keyboard.press('Enter');
  const editor = win.locator('.ProseMirror');
  await editor.waitFor({ timeout: 15000 });
  await editor.click();
  await win.keyboard.type('Hello from the acceptance run.');
  const file = await poll(() => notesOnDisk().find((f) => /Acceptance note/.test(f) && /Hello from the acceptance run/.test(fs.readFileSync(f, 'utf-8'))), 'the note reaches the disk');
  const saved = fs.readFileSync(file, 'utf-8');
  assert.match(saved, /^---\n[\s\S]*title: "?Acceptance note"?/, `front matter missing in:\n${saved}`);
  await shot('02-first-note');
});

await step('the native Format menu makes the text bold', async () => {
  await win.locator('.ProseMirror').click();
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const format = menu.items.find((item) => item.label === 'Format');
    format.submenu.items.find((item) => item.label === 'Bold').click();
  });
  // The command reaches the editor over IPC: a person types much later than that.
  await win.waitForTimeout(300);
  await win.keyboard.type('X');
  await poll(async () => (await win.locator('.ProseMirror strong').count()) > 0, 'the new text is bold');
});

await step('the tree and the board card offer to show a note in Finder (desktop app only)', async () => {
  const treeNote = win.locator('[data-testid="sidebar-shell"] button').filter({ hasText: 'Acceptance note' }).first();
  await treeNote.click({ button: 'right' });
  await win.getByTestId('show-in-finder').waitFor({ timeout: 5000 });
  await win.keyboard.press('Escape');
  // The same item sits in the card menu on the board.
  await win.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
  await win.waitForSelector('main [role=list]');
  const boardCard = win.locator('main [role=list] button').filter({ hasText: 'Acceptance note' }).first();
  await boardCard.click({ button: 'right' });
  await win.getByTestId('card-show-in-finder').waitFor({ timeout: 5000 });
  await win.keyboard.press('Escape');
});

await step('the native Select All selects the text of the note, not the whole window', async () => {
  // Предыдущий шаг оставил доску открытой: заметку открываем снова.
  await card('Acceptance note').click();
  await win.locator('.ProseMirror').waitFor();
  await win.locator('.ProseMirror').click();
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const edit = menu.items.find((item) => item.label === 'Edit');
    edit.submenu.items.find((item) => item.label === 'Select All').click();
  });
  await poll(async () => {
    const picked = await win.evaluate(() => window.getSelection()?.toString() || '');
    // Выделен текст заметки, а не окно: в боковой панели та же заметка осталась невыделенной.
    return picked.includes('Hello from the acceptance run') && !picked.includes('Acceptance note');
  }, 'the text of the note is selected, not the whole window');
});

await step('two notes that link to each other: relations, and the map shows both', async () => {
  const second = await makeNote('Linked note', 'Points back: [[Acceptance note]]');
  assert.equal(second.status, 200);
  await win.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
  await win.reload();
  await win.waitForSelector('main [role=list]');
  await card('Acceptance note').click();
  await win.locator('.ProseMirror').waitFor();
  await win.getByTestId('property-related-button').click();
  const row = win.getByTestId('related-row').filter({ hasText: 'Linked note' });
  await row.waitFor();
  assert.equal(await row.getAttribute('data-relation'), 'in');
  await win.getByTestId('show-on-map').click();
  await win.getByTestId('map-counts').waitFor({ timeout: 15000 });
  assert.match(await win.getByTestId('map-counts').innerText(), /2 notes, 1 link$/);
  const painted = await win.getByTestId('map-canvas').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
    return count;
  });
  assert.ok(painted > 100, `the map is drawn (${painted} pixels)`);
  await shot('03-map');
});

await step('search finds the note by name, from anywhere (⌘K)', async () => {
  await win.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
  await win.waitForTimeout(600);
  await win.keyboard.press(`${mod}+k`);
  const box = win.getByRole('dialog').getByRole('combobox');
  await box.fill('Linked');
  await win.getByRole('option', { name: /Linked note/ }).first().click();
  await win.locator('input[placeholder="Note Title"]').waitFor();
  assert.equal(await win.locator('input[placeholder="Note Title"]').inputValue(), 'Linked note');
});

await step('keys: ⌘N opens a new note, Esc closes it, ⌘B hides the sidebar and brings it back', async () => {
  await win.keyboard.press(`${mod}+n`);
  await win.getByRole('dialog').waitFor();
  await win.keyboard.press('Escape');
  await poll(async () => (await win.getByRole('dialog').count()) === 0, 'the dialog closes');
  await win.locator('main').click({ position: { x: 4, y: 300 } }).catch(() => {});
  const sidebar = win.getByTestId('sidebar-shell');
  const width = async () => (await sidebar.boundingBox())?.width || 0;
  assert.ok(await width() > 100);
  await win.evaluate(() => document.activeElement?.blur?.());
  await win.keyboard.press(`${mod}+b`);
  await poll(async () => (await width()) < 10, 'the sidebar hides');
  await win.keyboard.press(`${mod}+b`);
  await poll(async () => (await width()) > 100, 'the sidebar returns');
});

await step('settings: the theme changes the whole page, and back', async () => {
  await win.evaluate(() => { history.pushState({}, '', '/settings'); dispatchEvent(new PopStateEvent('popstate')); });
  await win.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await win.getByRole('button', { name: 'Dark', exact: true }).click();
  await poll(() => win.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode is applied');
  const bg = await win.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(bg, 'rgb(251, 241, 199)');
  await shot('04-settings-dark');
  await win.getByRole('button', { name: 'Light', exact: true }).click();
  await poll(() => win.evaluate(() => !document.documentElement.classList.contains('dark')), 'light mode returns');
});

await step('help has the keyboard table, with ⌘ on a Mac', async () => {
  await win.evaluate(() => { history.pushState({}, '', '/help'); dispatchEvent(new PopStateEvent('popstate')); });
  const help = win.getByTestId('help-view');
  await help.waitFor();
  await help.getByText('Keyboard shortcuts').first().scrollIntoViewIfNeeded();
  const text = await help.innerText();
  assert.match(text, /Command palette|command palette/);
  assert.match(text, process.platform === 'darwin' ? /⌘K/ : /Ctrl\+K/);
  await shot('05-help-keys');
});

await step('the terminal opens (⌘J), runs a command and shows its answer', async () => {
  await win.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
  await win.waitForTimeout(500);
  await win.locator('main').click({ position: { x: 4, y: 300 } }).catch(() => {});
  await win.keyboard.press(`${mod}+j`);
  const panel = win.getByTestId('terminal-panel');
  await poll(async () => { const box = await panel.boundingBox().catch(() => null); return box && box.height > 40; }, 'the terminal panel is shown');
  await win.waitForTimeout(1500);
  await win.keyboard.type('echo ACCEPT_$((20+22))\n');
  await poll(async () => /ACCEPT_42/.test((await panel.innerText().catch(() => '')) + (await win.locator('.xterm-rows').innerText().catch(() => ''))), 'the shell answers', 20000);
  await shot('06-terminal');
  // A right-click in the terminal opens the app's own menu: the browser's menu never appears in the app.
  const termBox = await panel.boundingBox();
  await win.mouse.click(termBox.x + 40, termBox.y + termBox.height - 40, { button: 'right' });
  await win.getByTestId('terminal-paste').waitFor({ timeout: 5000 });
  await win.getByTestId('terminal-select-all').waitFor();
  await win.keyboard.press('Escape');
  await poll(async () => (await win.getByTestId('terminal-paste').count()) === 0, 'the menu closes');
  await win.keyboard.press(`${mod}+j`);
});

await step('a phone-sized window stays usable: board, a note, no sideways scroll', async () => {
  await size(400, 860);
  await win.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
  await win.waitForSelector('main [role=list]');
  const sideways = await win.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(sideways, false);
  await card('Acceptance note').click();
  await win.locator('.ProseMirror').waitFor();
  assert.match(await win.locator('.ProseMirror').innerText(), /Hello from the acceptance run/);
  await shot('07-phone-note');
  await size(1360, 880);
});

await step('the native Delete removes the selected text', async () => {
  await win.locator('.ProseMirror').click();
  // Пауза, как в шаге с «Форматом»: клик только что сменил каретку.
  await win.waitForTimeout(300);
  // Выделение берём пунктом меню, как в соседнем шаге.
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const edit = menu.items.find((item) => item.label === 'Edit');
    edit.submenu.items.find((item) => item.label === 'Select All').click();
  });
  await poll(async () => ((await win.evaluate(() => window.getSelection()?.toString() || '')).length > 0), 'the text is selected');
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const edit = menu.items.find((item) => item.label === 'Edit');
    edit.submenu.items.find((item) => item.label === 'Delete').click();
  });
  // В редакторе остаётся пустой абзац, поэтому проверяем, что текста больше нет.
  await poll(async () => !(await win.locator('.ProseMirror').innerText()).includes('Hello'), 'the text is deleted');
});

// The native menu item that closes what is open (⌘W). The key itself is the system's: a synthetic
// key never gets to the menu, so the item is pressed instead.
const pressClose = () => app.evaluate(({ Menu }) => {
  const menu = Menu.getApplicationMenu();
  const close = menu.items.flatMap((item) => item.submenu?.items || []).find((item) => item.accelerator === 'Cmd+W');
  close.click();
});

// The native menu bar lives on macOS only; elsewhere there is no menu to press.
if (process.platform === 'darwin') {
  await step('the native menu closes the note, and the window stays', async () => {
    await pressClose();
    await poll(async () => (await win.locator('.ProseMirror').count()) === 0, 'the note closes');
    await poll(async () => (await win.locator('main [role=list]').count()) > 0, 'the board is back');
    assert.equal(win.isClosed(), false, 'the window stays');
    await shot('07b-cmd-w-note');
  });
}

await step('quit and start again: the notes are where they were, links and map intact', async () => {
  await app.close();
  await launch();
  await win.waitForSelector('main [role=list]', { timeout: 30000 });
  const list = await win.locator('main [role=list]').innerText();
  assert.match(list, /Acceptance note/);
  assert.match(list, /Linked note/);
  const graph = await api('/api/graph');
  assert.equal(graph.body.nodes.length, 2);
  assert.equal(graph.body.edges.length, 1);
  assert.equal(notesOnDisk().length, 2);
  await shot('08-after-restart');
});

if (process.platform === 'darwin') {
  await step('without a note the same menu closes the window, and the app opens a new one', async () => {
    await pressClose();
    await poll(() => win.isClosed(), 'the window closes');
    // The app lives on: the next window opens by itself, the way a Mac app does.
    await app.evaluate(({ app }) => app.emit('activate'));
    await poll(async () => (await app.windows()).length > 0, 'a new window opens');
    const [reopened] = await app.windows();
    win = reopened;
    await win.waitForSelector('main [role=list]', { timeout: 30000 });
    await shot('09-window-reopened');
  });
}

await step('the settings open in their own window, like on macOS', async () => {
  const before = (await app.windows()).length;
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const appMenu = menu.items[0];
    appMenu.submenu.items.find((item) => item.label === 'Settings…' || item.label === 'Настройки…').click();
  });
  await poll(async () => (await app.windows()).length > before, 'the settings window opens');
  const windows = await app.windows();
  const settings = windows.find((w) => w.url().includes('/settings')) || windows[windows.length - 1];
  await settings.waitForSelector('[data-testid="appearance-section"]', { timeout: 15000 });
  // The notes stay in their own window.
  assert.equal((await app.windows()).length, before + 1);
  // ⌘W in the settings window closes that window, not the notes.
  await app.evaluate(({ Menu }) => {
    const noteMenu = Menu.getApplicationMenu().items.find((item) => item.label === 'Note' || item.label === 'Заметка');
    noteMenu.submenu.items.find((item) => item.accelerator === 'Cmd+W').click();
  });
  await poll(async () => (await app.windows()).length === before, 'the settings window closes');
});

await step('the Format menu is grey in a locked note: its text cannot be edited', async () => {
  // Обычная заметка: её состояние снимает серость, оставшуюся от окна настроек.
  await card('Acceptance note').click();
  await win.locator('.ProseMirror').waitFor();
  await poll(async () => {
    const enabled = await app.evaluate(({ Menu }) => {
      const format = Menu.getApplicationMenu().items.find((item) => item.label === 'Format' || item.label === 'Формат');
      if (!format) return null;
      const bold = format.submenu.items.find((item) => item.label === 'Bold' || item.label === 'Жирный');
      return bold ? bold.enabled : null;
    });
    return enabled === true;
  }, 'the format items are live in a normal note');
  // Запертую заметку пишем прямо в папку: её текст не грузится, значит редактора нет.
  fs.writeFileSync(
    path.join(notesDir, 'Locked.md'),
    '---\nmonos-locked: true\n---\n-----BEGIN MONOS LOCKED NOTE-----\nAAAA\n-----END MONOS LOCKED NOTE-----\n',
  );
  // На доску: после перезагрузки приложение возвращается в последнюю заметку, а не в список.
  await win.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
  await win.reload();
  await win.waitForSelector('main [role=list]');
  await card('Locked').waitFor({ timeout: 10000 });
  await card('Locked').click();
  await win.getByTestId('locked-overlay').waitFor({ timeout: 10000 });
  await poll(async () => {
    // Меню могло ещё не переключиться на язык интерфейса, поэтому ищем оба названия.
    const enabled = await app.evaluate(({ Menu }) => {
      const format = Menu.getApplicationMenu().items.find((item) => item.label === 'Format' || item.label === 'Формат');
      if (!format) return null;
      const bold = format.submenu.items.find((item) => item.label === 'Bold' || item.label === 'Жирный');
      return bold ? bold.enabled : null;
    });
    return enabled === false;
  }, 'the format items are greyed out');
});

await step('no error reached the console during the whole run', async () => {
  const real = errors.filter((line) => !/favicon|DevTools|Autofill/i.test(line));
  assert.deepEqual(real, [], `console errors:\n${real.join('\n')}`);
});

await app.close().catch(() => {});
fs.rmSync(userData, { recursive: true, force: true });
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length} of ${results.length} steps passed on the ${label}. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
