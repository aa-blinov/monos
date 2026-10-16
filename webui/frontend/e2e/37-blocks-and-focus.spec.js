import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle } from './support/monos.js';

const fileOf = async (page, path) => (await (await page.request.get(`/api/file?path=${encodeURIComponent(path)}`)).json()).content;

test('таблица растёт и сжимается из полоски инструментов, код меняет язык', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Blocks');
  const path = `notes/${title}.md`;
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: '| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst a = 1;\n```' } });
  await openNote(page, title);

  await page.locator('.ProseMirror td').first().click();
  const tools = page.getByTestId('block-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button', { name: '+ Row' }).click();
  await expect(page.locator('.ProseMirror tr')).toHaveCount(3);
  await tools.getByRole('button', { name: '+ Column' }).click();
  await expect(page.locator('.ProseMirror tr').first().locator('th, td')).toHaveCount(3);
  await tools.getByRole('button', { name: '− Row' }).click();
  await expect(page.locator('.ProseMirror tr')).toHaveCount(2);

  await page.locator('.ProseMirror pre').click();
  await expect(tools.getByRole('combobox', { name: 'Language' })).toBeVisible();
  await tools.getByRole('combobox', { name: 'Language' }).selectOption('python');
  await expect.poll(() => fileOf(page, path)).toContain('```python');
});

test('голый адрес в тексте подсвечен и открывается из панели под курсором', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Bare Url');
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'См. https://example.com/docs и дальше.' } });
  await openNote(page, title);
  const link = page.locator('.ProseMirror .external-link');
  await expect(link).toHaveText('https://example.com/docs');
  await link.click();
  const popup = page.waitForEvent('popup');
  await page.getByTestId('wiki-link-bar').getByRole('button', { name: /Open link/ }).click();
  expect((await popup).url()).toContain('example.com/docs');
});

test('режим фокуса прячет сайдбар и нижнюю панель, Esc возвращает всё как было', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Focus');
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: 'Текст.' } });
  await openNote(page, title);
  const sidebar = page.getByTestId('sidebar-shell');
  const sidebarWidth = async () => (await sidebar.boundingBox())?.width || 0;
  const before = await sidebarWidth();

  await page.getByTestId('editor-more').click();
  await page.getByTestId('toggle-focus-mode').click();
  await expect(page.getByTestId('editor-footer')).toHaveCount(0);
  await expect(page.getByTestId('exit-focus')).toBeVisible();
  await expect.poll(sidebarWidth).toBe(0);

  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('editor-footer')).toBeVisible();
  await expect.poll(sidebarWidth).toBe(before);
});
