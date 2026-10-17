import { expect, test } from '@playwright/test';
import { openSidebarMore, prepareMonos, uniqueTitle } from './support/monos.js';

// A tag in the Tags panel, and a saved search, put a query in the search field and must run it: the
// header only searches while typing, so the board used to say "nothing found" for notes that are there.
test('нажатие на тег в панели «Теги» показывает заметки с этим тегом', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Tagged Recipe');
  const tag = `food${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [tag], content: 'Свёкла.' } });

  await page.goto('/');
  await openSidebarMore(page);
  await page.getByTestId('open-tags').first().click();
  await page.getByRole('button', { name: new RegExp(`^${tag}$`) }).click();

  // Inside the results, not the sidebar tree, which lists the note anyway.
  await expect(page.locator('main').getByRole('status')).toContainText('1');
  await expect(page.locator('main').getByText(title).first()).toBeVisible();
});

test('сохранённый поиск запускается сразу', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Saved Target');
  const word = `zebra${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: `Слово ${word}.` } });
  await page.request.put('/api/saved-searches', { data: { searches: [{ name: 'Zebra', query: word }] } });

  await page.goto('/');
  await openSidebarMore(page);
  await page.getByTestId('open-saved-searches').first().click();
  await page.getByTestId('saved-search-run').first().click();

  await expect(page.locator('main').getByRole('status')).toContainText('1');
  await expect(page.locator('main').getByText(title).first()).toBeVisible();
});
