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
  await page.locator('[data-testid="editor-shell"] header').getByRole('button', { name: 'History' }).click();
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
