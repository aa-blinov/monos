import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The board's strip of tags narrows it at once, the order is chosen beside the columns, and the last line
// says how many notes are shown of how many there are.
test('доска: тег сразу сужает список, порядок по названию, счётчик внизу', async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => {
    localStorage.setItem('noteView', 'board');
    localStorage.setItem('boardGroupByColor', 'false');
    localStorage.setItem('boardSort', 'modified');
  });
  const stamp = Date.now();
  const tag = `topic${stamp}`;
  for (const title of [`Zulu ${stamp}`, `Alpha ${stamp}`]) {
    await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [tag], content: 'text' } });
  }
  await page.request.post('/api/notes/create', { data: { title: `Other ${stamp}`, category: 'Board', tags: ['x'], content: 'text' } });

  await page.goto('/');
  const strip = page.getByTestId('board-tags');
  await strip.getByRole('button', { name: tag }).click();
  const cards = page.locator('main [role=list] [data-testid="note-card"], main [role=list] > button:not([class*="border-dashed"])');
  await expect(page.getByTestId('board-count')).toHaveText(/Showing 2 of 2/i);
  await expect(page.getByText(`Other ${stamp}`)).toHaveCount(0);

  await page.locator('#board-sort').selectOption('title');
  await expect(async () => {
    const text = await page.locator('main [role=list]').innerText();
    expect(text.indexOf(`Alpha ${stamp}`)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(`Alpha ${stamp}`)).toBeLessThan(text.indexOf(`Zulu ${stamp}`));
  }).toPass();

  await strip.getByRole('button', { name: tag }).click();
  await expect(page.getByTestId('board-count')).not.toHaveText(/of 2$/i);
  void cards;
});
