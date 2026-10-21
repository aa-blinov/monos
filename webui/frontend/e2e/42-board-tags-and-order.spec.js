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

  await page.locator('#board-sort').click();
  await page.getByRole('menuitemradio', { name: 'By title' }).click();
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

// The phone's foot keeps three rows: Other, Terminal (in the app), Settings. The tools and the trash wait
// inside Other, so the note stays in view and every row is a touch target.
test('меню слева на телефоне: снаружи Прочее и Настройки, корзина внутри', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /Open sidebar/ }).first().click();
  const footer = page.getByTestId('phone-tools');
  await expect(footer.getByTestId('open-more')).toBeVisible();
  await expect(footer.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  // The trash is no longer a row of its own.
  await expect(footer.getByRole('button', { name: 'Trash', exact: true })).toHaveCount(0);

  const boxes = await footer.locator('button').evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect();
    return { right: Math.round(box.right), height: Math.round(box.height) };
  }));
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.right).toBeLessThanOrEqual(390);
  }

  await footer.getByTestId('open-more').click();
  const menu = page.getByTestId('more-menu');
  await expect(menu).toBeVisible();
  // The tools are inside, and the trash is the last item, away from the ones used every day.
  await expect(menu.getByTestId('open-map')).toBeVisible();
  await expect(menu.getByTestId('open-templates')).toBeVisible();
  await expect(menu.getByTestId('open-trash')).toBeVisible();
  await expect(menu.getByRole('menuitem').last()).toContainText('Trash');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
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

// The tags and the order decide what the board shows, so they stay at the top while the cards scroll.
test('доска: строка фильтров закреплена при прокрутке', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.addInitScript(() => localStorage.setItem('noteView', 'board'));
  const stamp = Date.now();
  for (let i = 0; i < 16; i += 1) {
    await page.request.post('/api/notes/create', { data: { title: `Scroll ${stamp} ${i}`, category: 'Board', tags: [], content: 'text' } });
  }
  await page.goto('/');

  const bar = page.locator('#board-sort').locator('xpath=ancestor::div[contains(@class,"sticky")][1]');
  await expect(bar).toBeVisible();
  const scroller = page.locator('[data-board-scroll]');
  const scrollBox = await scroller.boundingBox();
  const atRest = await bar.boundingBox();
  expect(atRest.y).toBeGreaterThan(scrollBox.y + 4);

  await scroller.evaluate((el) => { el.scrollTop = 600; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(300);

  const stuck = await bar.boundingBox();
  // The bar keeps the page's own top gap while it sticks, and no card shows in that strip: the bar's
  // background reaches up over it.
  expect(stuck.y).toBeGreaterThan(scrollBox.y + 4);
  expect(Math.abs(stuck.y - atRest.y)).toBeLessThanOrEqual(1);
  const gapIsBar = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('div.sticky')), { x: stuck.x + 20, y: stuck.y - 6 });
  expect(gapIsBar).toBe(true);
  // The gap above the controls and the one below them are the same.
  const toolbar = await page.locator('#board-sort').locator('xpath=..').boundingBox();
  const above = stuck.y - scrollBox.y;
  const below = (stuck.y + stuck.height) - (toolbar.y + toolbar.height);
  expect(Math.abs(above - below)).toBeLessThanOrEqual(2);
  await expect(page.locator('#board-sort')).toBeInViewport();
});
