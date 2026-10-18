import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

// Every shortcut the Help lists works as the Help says. (⌘J and ⌘F in the terminal need the desktop app's
// terminal bridge, which a browser does not have: the Electron run covers them.)
const MOD = 'ControlOrMeta';

async function noteWith(page, content) {
  const title = uniqueTitle('Hotkeys');
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content } })).json();
  await openNote(page, title);
  await expect(page.locator('.ProseMirror')).toBeVisible();
  return { title, path: created.path };
}

test.describe('everywhere', () => {
  test.beforeEach(async ({ page }) => {
    await prepareMonos(page);
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
  });

  test('⌘K opens the command palette and Esc closes it', async ({ page }) => {
    await page.keyboard.press(`${MOD}+k`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox')).toHaveAttribute('placeholder', 'Type a command or note...');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('⌘O opens the note switcher', async ({ page }) => {
    await page.keyboard.press(`${MOD}+o`);
    await expect(page.getByRole('dialog').getByRole('combobox')).toHaveAttribute('placeholder', 'Open note...');
  });

  test('⌘N opens a new note', async ({ page }) => {
    await page.keyboard.press(`${MOD}+n`);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /new note/i })).toBeVisible();
  });

  test('⌘B hides and shows the sidebar outside the text', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar-shell');
    const width = async () => (await sidebar.boundingBox())?.width || 0;
    expect(await width()).toBeGreaterThan(100);
    await page.keyboard.press(`${MOD}+b`);
    await expect.poll(width).toBeLessThan(10);
    await page.keyboard.press(`${MOD}+b`);
    await expect.poll(width).toBeGreaterThan(100);
  });

  test('/ and ⌘⇧F open the search on the board', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: /search/i }).first();
    await page.keyboard.press('/');
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await search.evaluate((el) => el.blur());
    await page.keyboard.press(`${MOD}+Shift+f`);
    await expect(search).toBeFocused();
  });
});

test.describe('in a note', () => {
  test.beforeEach(async ({ page }) => {
    await prepareMonos(page);
  });

  test('⌘B bolds the selection instead of toggling the sidebar', async ({ page }) => {
    const { path } = await noteWith(page, 'plain words here\n');
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+b`);
    await waitForSavedContent(page, path, '**plain words here**');
    expect((await page.getByTestId('sidebar-shell').boundingBox()).width).toBeGreaterThan(100);
  });

  test('⌘I italicises, ⌘E makes code in the line', async ({ page }) => {
    const { path } = await noteWith(page, 'alpha beta\n');
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+i`);
    await waitForSavedContent(page, path, '*alpha beta*');
    await page.keyboard.press(`${MOD}+i`);
    await page.keyboard.press(`${MOD}+e`);
    await waitForSavedContent(page, path, '`alpha beta`');
  });

  test('⌘Z undoes and ⌘⇧Z redoes', async ({ page }) => {
    await noteWith(page, 'start\n');
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type(' typed');
    await expect(editor).toContainText('start typed');
    await page.keyboard.press(`${MOD}+z`);
    await expect(editor).not.toContainText('typed');
    await page.keyboard.press(`${MOD}+Shift+z`);
    await expect(editor).toContainText('start typed');
  });

  test('⌘S saves now', async ({ page }) => {
    const { path } = await noteWith(page, 'first\n');
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type(' second');
    await page.keyboard.press(`${MOD}+s`);
    await waitForSavedContent(page, path, 'first second');
  });

  test('/ at the start of a line opens the block menu, Esc closes it', async ({ page }) => {
    await noteWith(page, '\n');
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('/');
    const menu = page.getByRole('listbox', { name: 'Slash commands' });
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('[[ offers note names', async ({ page }) => {
    const other = uniqueTitle('Linked Target');
    await page.request.post('/api/notes/create', { data: { title: other, category: '', tags: [], content: 'x' } });
    await noteWith(page, '\n');
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('[[Linked Target');
    await expect(page.getByText(other).first()).toBeVisible();
  });

  test('⌘Enter inside a link opens the note it names', async ({ page }) => {
    const target = uniqueTitle('Follow Me');
    await page.request.post('/api/notes/create', { data: { title: target, category: '', tags: [], content: 'target body' } });
    await noteWith(page, `go to [[${target}]] now\n`);
    const link = page.locator('.ProseMirror .wiki-link:not(.wiki-link-bracket)').first();
    await expect(link).toBeVisible();
    // The server tells whether the note exists a moment after the link is drawn; the key follows it only then.
    await expect(page.locator('.ProseMirror .wiki-link-found:not(.wiki-link-bracket)').first()).toBeVisible();
    await link.click();
    // The caret in the link shows its brackets: that is when the editor knows where the caret is.
    await expect(page.locator('.ProseMirror .wiki-link-bracket')).toHaveCount(0);
    await page.keyboard.press(`${MOD}+Enter`);
    await expect(page).toHaveURL(/\/notes\/.*Follow/);
    await expect(page.locator('.ProseMirror')).toContainText('target body');
  });

  test('⌘-click on a link opens the note it names', async ({ page }) => {
    const target = uniqueTitle('Click Me');
    await page.request.post('/api/notes/create', { data: { title: target, category: '', tags: [], content: 'clicked body' } });
    await noteWith(page, `see [[${target}]] there\n`);
    await page.locator('.ProseMirror .wiki-link:not(.wiki-link-bracket)').first().click({ modifiers: [MOD] });
    await expect(page.locator('.ProseMirror')).toContainText('clicked body');
  });
});

test.describe('in the tree', () => {
  test('Shift+F10 opens the context menu of the focused row', async ({ page }) => {
    await prepareMonos(page);
    const title = uniqueTitle('Tree Menu');
    await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'x' } });
    await page.goto('/');
    const row = page.getByTestId('tree-drop-zone').getByRole('button', { name: new RegExp(title) }).first();
    await row.focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('⌘-click selects several notes without opening them', async ({ page }) => {
    await prepareMonos(page);
    const a = uniqueTitle('Select A');
    const b = uniqueTitle('Select B');
    for (const title of [a, b]) await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'x' } });
    await page.goto('/');
    const zone = page.getByTestId('tree-drop-zone');
    await zone.getByRole('button', { name: new RegExp(a) }).first().click({ modifiers: [MOD] });
    await zone.getByRole('button', { name: new RegExp(b) }).first().click({ modifiers: [MOD] });
    await expect(page).toHaveURL(/\/$/);
  });
});

// A narrow window has no room for the footer's terminal button: the note's "..." menu opens the terminal instead.
test('узкое окно: «Терминал» в меню заметки «…» открывает терминал', async ({ page }) => {
  await prepareMonos(page);
  // The desktop app's bridge, as far as the panel needs it.
  await page.addInitScript(() => {
    window.monosTerminal = {
      create: async () => ({ id: 1 }), write() {}, resize() {}, kill() {}, process: async () => null,
      onData: () => () => {}, onExit: () => () => {},
    };
  });
  await noteWith(page, 'x\n');
  await expect(page.getByTestId('footer-terminal')).toBeVisible();
  // Narrow the window with the note open: the footer button gives way, the menu takes over.
  await page.setViewportSize({ width: 560, height: 800 });
  await expect(page.getByTestId('footer-terminal')).toBeHidden();
  await page.getByTestId('editor-more').click();
  // The terminal's module is fetched on first use; the dev server needs a few seconds to build xterm.
  await page.getByTestId('menu-terminal').click();
  await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 30000 });
});
