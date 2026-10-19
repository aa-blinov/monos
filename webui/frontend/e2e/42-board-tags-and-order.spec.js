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
  // In a vault with many tags this one may wait behind "N more": choose it from the list.
  await page.getByTestId('board-tags-more').click();
  await page.getByTestId('board-tags-filter').fill(tag);
  await page.getByTestId('board-tag-option').click();
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
});

// On a phone a long title takes two lines at most, so one card never grows into a column of its own.
test('доска на телефоне: длинное название карточки занимает не больше двух строк', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.addInitScript(() => localStorage.setItem('noteView', 'board'));
  const title = `PRD для системы прогноза новостных публикаций для выбранных СМИ ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  const heading = page.locator('main [role=list]').getByText(title).first();
  await expect(heading).toBeVisible();
  const { height, lineHeight } = await heading.evaluate((el) => ({ height: el.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(el).lineHeight) }));
  expect(height).toBeLessThanOrEqual(lineHeight * 2 + 2);
});

// The phone's menu keeps touch-sized rows (44px) in two columns, so the tools do not push the notes off the screen.
test('меню слева на телефоне: инструменты в две колонки, у заметок остаётся место', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /Open sidebar/ }).first().click();
  const help = page.getByTestId('open-help');
  await expect(help).toBeVisible();
  // The grid holds as many items as the state asks for, so its last row may stand alone: the check is
  // that the tools stand in two columns and that each of them is a touch target.
  const boxes = await page.getByTestId('phone-tools').locator('button').evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect();
    return { x: Math.round(box.x), right: Math.round(box.right), height: Math.round(box.height) };
  }));
  expect([...new Set(boxes.map((b) => b.x))].length).toBe(2);
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.right).toBeLessThanOrEqual(390);
  }
  const tools = await page.getByTestId('phone-tools').boundingBox();
  // Ten tools stay under a third of the screen, the rest is for the notes.
  expect(tools.height).toBeLessThan(800 * 0.4);
});

// The tag field says what it is for even when the note already has tags: an empty box tells nothing.
test('заметка: поле тегов подсказывает «Add a tag», пока теги уже есть', async ({ page }) => {
  await prepareMonos(page);
  const title = `Tag hint ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: ['one'], content: 'text' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await page.getByTestId('property-tags-button').click();
  await expect(page.getByTestId('property-tags')).toHaveAttribute('placeholder', 'Add a tag');
});

// On a phone the note's actions share the top row and the date keeps the line under the title to itself.
test('заметка на телефоне: «Структура» в верхней строке, дата — в мета-строке', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 390, height: 800 });
  const title = `Meta line ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  const outline = page.getByTestId('outline-toggle');
  await expect(outline).toBeVisible();
  const back = page.getByRole('button', { name: 'Back to notes' });
  const date = page.getByText(/^Modified /).first();
  const [a, b, c] = [await outline.boundingBox(), await back.boundingBox(), await date.boundingBox()];
  // The button stands in the row above the title, next to the other actions of that row.
  expect(Math.abs((a.y + a.height / 2) - (b.y + b.height / 2))).toBeLessThan(12);
  expect(c.y - a.y).toBeGreaterThan(20);
  // The bar of a phone has no room for the trash: it waits in the menu of the foot.
  await page.getByTestId('editor-more').click();
  await expect(page.getByTestId('menu-trash')).toBeVisible();
});
