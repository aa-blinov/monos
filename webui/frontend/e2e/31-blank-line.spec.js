import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

test('Enter в начале заметки создаёт пустую строку выше, текст встаёт перед строкой и пустая строка переживает сохранение', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Blank Line');
  const created = await (await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: 'Первая строка\n\nВторая строка\n' },
  })).json();

  await page.goto('/');
  await openNote(page, title);
  await page.locator('.ProseMirror').first().click();
  await page.evaluate(() => {
    const root = document.querySelector('.ProseMirror');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    range.setStart(walker.nextNode(), 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Enter');
  await page.keyboard.type('вентоер ');

  await waitForSavedContent(page, created.path, 'вентоер Первая строка');
  const saved = await (await page.request.get(`/api/file?path=${encodeURIComponent(created.path)}`)).json();
  expect(saved.content).toContain('&nbsp;\n\nвентоер Первая строка\n\nВторая строка');

  await page.goto('/');
  await openNote(page, title);
  await expect(page.locator('.ProseMirror > p')).toHaveCount(3);
});
