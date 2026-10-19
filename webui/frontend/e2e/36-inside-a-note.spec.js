import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle } from './support/monos.js';

const titleInput = (page) => page.locator('input[placeholder="Note Title"]');
const fileOf = async (page, path) => (await page.request.get(`/api/file?path=${encodeURIComponent(path)}`)).json();

test('название — это имя файла: правка названия переименовывает файл и ссылки на него', async ({ page }) => {
  await prepareMonos(page);
  const oldTitle = uniqueTitle('Rename Me');
  const newTitle = uniqueTitle('Renamed');
  const linker = uniqueTitle('Linker');
  await page.request.post('/api/notes/create', { data: { title: oldTitle, category: '', tags: [], content: 'Тело' } });
  const created = await page.request.post('/api/notes/create', { data: { title: linker, category: '', tags: [], content: `См. [[${oldTitle}]]` } });
  const linkerPath = (await created.json()).path;

  await openNote(page, oldTitle);
  await titleInput(page).fill(newTitle);
  await titleInput(page).press('Enter');

  await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(newTitle)}\\.md$`));
  await expect(titleInput(page)).toHaveValue(newTitle);
  await expect.poll(async () => (await fileOf(page, linkerPath)).content).toContain(`[[${newTitle}]]`);
  const tree = await (await page.request.get('/api/tree')).json();
  expect(JSON.stringify(tree)).not.toContain(`${oldTitle}.md`);
});

test('подсказки [[ открываются под набираемой строкой, а не поверх неё', async ({ page }) => {
  await prepareMonos(page);
  const target = uniqueTitle('Suggest Target');
  const title = uniqueTitle('Suggest Source');
  await page.request.post('/api/notes/create', { data: { title: target, category: '', tags: [], content: 'x' } });
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'Первая строка.\n\nВторая.\n\nТретья.' } });
  await openNote(page, title);
  await page.locator('.ProseMirror p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[[Suggest Tar');
  const list = page.getByRole('listbox').last();
  await expect(list).toBeVisible();
  const caretBottom = await page.evaluate(() => getSelection().getRangeAt(0).getBoundingClientRect().bottom);
  const box = await list.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(caretBottom - 1);
});

test('панели заметки: папки внутри окошка, быстрый срок, подсказки тегов', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Panels');
  await page.request.post('/api/notes/create', { data: { title, category: 'Work', tags: ['alpha-tag'], content: 'x' } });
  const other = uniqueTitle('Panels Other');
  await page.request.post('/api/notes/create', { data: { title: other, category: '', tags: ['beta-tag'], content: 'y' } });
  await openNote(page, title);

  await page.getByTestId('property-category-button').click();
  const panel = page.locator('[data-panel="category"]');
  await panel.getByRole('combobox').click();
  const list = panel.getByRole('listbox');
  await expect(list).toBeVisible();
  const [panelBox, listBox] = [await panel.boundingBox(), await list.boundingBox()];
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  await page.keyboard.press('Escape');

  await page.getByTestId('property-due-button').click();
  await page.getByTestId('due-quick').filter({ hasText: 'Tomorrow' }).click();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  await expect.poll(async () => (await fileOf(page, `notes/Work/${title}.md`)).content).toContain(`due: ${iso}`);
  await page.keyboard.press('Escape');

  await page.locator('[data-panel-anchor="tags"] button').first().click();
  const suggestions = page.getByTestId('tag-suggestions');
  await expect(suggestions.getByRole('button', { name: '#beta-tag' })).toBeVisible();
  await suggestions.getByRole('button', { name: '#beta-tag' }).click();
  await expect.poll(async () => (await fileOf(page, `notes/Work/${title}.md`)).content).toContain('beta-tag');
});

test('история без синхронизации ведёт в настройки', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('History');
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'x' } });
  await openNote(page, title);
  await page.getByTestId('footer-history').click();
  const setUp = page.getByTestId('history-open-sync');
  if (await setUp.count()) {
    await setUp.click();
    await expect(page).toHaveURL(/\/settings$/);
  }
});

test('на длинной заметке шапка сворачивается при прокрутке и разворачивается наверху', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Long');
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: Array.from({ length: 80 }, (_, i) => `Абзац ${i}.`).join('\n\n') } });
  await openNote(page, title);
  const scroller = page.getByTestId('rich-editor-input');
  await scroller.evaluate((el) => { el.scrollTop = 600; el.dispatchEvent(new Event('scroll')); });
  await expect(page.getByTestId('header-compact-title')).toHaveText(title);
  await expect(titleInput(page)).toBeHidden();
  await scroller.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await expect(titleInput(page)).toBeVisible();
});

// With a repository connected the note says "Synced <time>" or "Not synced"; the tooltip says on which side it differs.
test('заметка: статус синхронизации по четырём состояниям, без репозитория строки нет', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1300, height: 900 });
  const title = uniqueTitle('Sync line');
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } })).json();
  const key = created.path.replace(/^notes\//, '');
  let answer = { initialized: true, status: 'clean', repo: 'me/notes', last_sync: '2026-10-18T10:00:00.000Z', unsent: [], incoming: [] };
  await page.route('**/api/git/status', (route) => route.fulfill({ json: answer }));
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  const line = page.getByTestId('note-sync');
  await expect(line).toHaveAttribute('data-state', 'synced');
  await expect(line).toContainText('Synced');

  for (const [extra, state, text] of [
    [{ unsent: [key] }, 'local', 'sent yet'],
    [{ incoming: [key] }, 'remote', 'another device; the next sync brings it here'],
    [{ unsent: [key], incoming: [key] }, 'both', 'merges both versions'],
  ]) {
    answer = { ...answer, unsent: [], incoming: [], ...extra };
    await page.reload();
    await expect(page.getByTestId('note-sync')).toHaveAttribute('data-state', state);
    await expect(page.getByTestId('note-sync')).toContainText('Not synced');
    await expect(page.getByTestId('note-sync')).toHaveAttribute('title', new RegExp(text));
  }

  answer = { initialized: true, status: 'clean', repo: '', remote: false };
  await page.reload();
  await expect(page.getByTestId('editor-shell')).toBeVisible();
  await expect(page.getByTestId('note-sync')).toHaveCount(0);
});

// With a repository connected the header's line carries date, sync, stats and tasks at once. It is a
// sentence and nothing else: the buttons stand in the row above, so the line never drops a part of its own.
test('заметка: мета-строка шапки с синхронизацией и задачами остаётся в одну линию', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const title = uniqueTitle('Header line');
  const content = `${'слово '.repeat(120)}\n\n- [x] сделана\n- [ ] ждёт`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content } });
  await page.route('**/api/git/status', (route) => route.fulfill({ json: { initialized: true, status: 'clean', repo: 'me/notes', last_sync: null, unsent: [], incoming: [] } }));
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();

  const meta = page.getByTestId('note-meta');
  await expect(page.getByTestId('task-progress')).toBeVisible();
  await expect(meta.locator('button')).toHaveCount(0);
  // Every part of the line must sit on the same row: the date, the sync state, the stats and the task
  // progress. A second row means the line wrapped.
  const tops = await meta.evaluate((el) => [...el.children].map((child) => Math.round(child.getBoundingClientRect().top)));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(8);
});

// The Sync button belongs to a connected repository: it stays when the status check fails, and a repository
// kept only for history (no remote) does not show it.
test('боковая панель: «Синхронизировать» не мигает при сбое статуса и не показывается без remote', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1300, height: 900 });
  const sync = page.getByRole('button', { name: /^Sync now$/ });
  await page.route('**/api/git/status', (route) => route.fulfill({ json: { initialized: true, status: 'clean', repo: 'me/notes', last_sync: null } }));
  await page.goto('/');
  await expect(sync).toBeVisible();

  await page.unroute('**/api/git/status');
  await page.route('**/api/git/status', (route) => route.fulfill({ status: 500, json: { detail: 'index.lock exists' } }));
  await page.reload();
  await expect(page.getByTestId('open-more')).toBeVisible();
  await expect(sync).toBeVisible();

  await page.unroute('**/api/git/status');
  await page.route('**/api/git/status', (route) => route.fulfill({ json: { initialized: true, status: 'clean', repo: '', remote: false } }));
  await page.reload();
  await expect(page.getByTestId('open-more')).toBeVisible();
  await expect(sync).toHaveCount(0);
});

// The width setting changes the text column only: the title and the header keep their own column of 48rem, so
// the text edges move away from the centre while the title stays where it is. Both columns are centred on the
// same axis, but they are not the same width, so the title does not stand on the text's left edge.
test('ширина контента: заголовок и шапка не двигаются, поля текста меняются с обеих сторон', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1500, height: 900 });
  const title = uniqueTitle('Width');
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'Some words that fill the column. '.repeat(40) } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  const measure = async () => ({
    title: await page.getByLabel('Note Title').boundingBox(),
    text: await page.locator('.ProseMirror').boundingBox(),
  });
  await page.evaluate(() => localStorage.setItem('contentWidth', 'wide'));
  await page.reload();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  const wide = await measure();
  await page.evaluate(() => localStorage.setItem('contentWidth', 'narrow'));
  await page.reload();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  const narrow = await measure();
  expect(Math.abs(narrow.title.x - wide.title.x)).toBeLessThan(1);
  expect(Math.abs(narrow.title.width - wide.title.width)).toBeLessThan(1);
  const middle = (box) => box.x + box.width / 2;
  expect(Math.abs(middle(narrow.text) - middle(wide.text))).toBeLessThan(2);
  expect(narrow.text.x).toBeGreaterThan(wide.text.x + 100);
  expect(narrow.text.width).toBeLessThan(wide.text.width - 200);
});
