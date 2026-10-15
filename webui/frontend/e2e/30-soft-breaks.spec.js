import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

test('одиночный перенос строки в абзаце переживает открытие и сохранение заметки', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Soft Break');
  const created = await (await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: 'Первая строка\nвторая строка\n' },
  })).json();
  const notePath = created.path;

  await page.goto('/');
  await openNote(page, title);
  await page.locator('.ProseMirror p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');

  await waitForSavedContent(page, notePath, 'вторая строка!');
  const saved = await (await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`)).json();
  expect(saved.content).toContain('Первая строка\nвторая строка!');
});
