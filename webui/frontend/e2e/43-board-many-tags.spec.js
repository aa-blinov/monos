import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// With many tags the board shows the busiest few as chips and keeps the rest behind "N more": a list of
// every tag with its count and a search box. A tag chosen from that list shows as a chip, so it can be lifted.
test('доска: много тегов, «Ещё N» открывает список с поиском, выбранный тег становится чипом', async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => {
    localStorage.setItem('noteView', 'board');
    localStorage.setItem('boardGroupByColor', 'false');
  });
  const stamp = Date.now();
  const rare = `zz-rare-${stamp}`;
  for (let i = 0; i < 9; i += 1) {
    await page.request.post('/api/notes/create', { data: { title: `Many ${i} ${stamp}`, category: 'Board', tags: [`many${i}-${stamp}`, `shared-${stamp}`], content: 'text' } });
  }
  await page.request.post('/api/notes/create', { data: { title: `Rare ${stamp}`, category: 'Board', tags: [rare], content: 'text' } });

  await page.goto('/');
  const strip = page.getByTestId('board-tags');
  await expect(strip.getByRole('button', { name: rare })).toHaveCount(0);

  await page.getByTestId('board-tags-more').click();
  const menu = page.getByTestId('board-tags-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('board-tags-filter')).toBeFocused();
  await page.getByTestId('board-tags-filter').fill('zz-rare');
  await expect(page.getByTestId('board-tag-option')).toHaveCount(1);
  await page.getByTestId('board-tag-option').click();

  await expect(menu).toHaveCount(0);
  await expect(strip.getByRole('button', { name: rare })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('board-count')).toHaveText(/1 of 1$/i);

  // Chips, "N more" and the box with the order and colors are one height, so the row reads as one.
  const toolbar = await page.locator('#board-sort').locator('xpath=..').boundingBox();
  for (const box of [await strip.getByRole('button', { name: rare }).boundingBox(), await page.getByTestId('board-tags-more').boundingBox()]) {
    expect(Math.abs(box.height - toolbar.height)).toBeLessThanOrEqual(1);
  }

  await strip.getByRole('button', { name: rare }).click();
  await expect(page.getByTestId('board-count')).not.toHaveText(/of 1$/i);

  await page.getByTestId('board-tags-more').click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

// On a phone the chips give way to one "Tags" button in the row with the order, and the same list opens from it.
test('доска на телефоне: одна кнопка «Теги» в строке с порядком, выбранный тег виден в кнопке', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.addInitScript(() => localStorage.setItem('noteView', 'board'));
  const tag = `phone-${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title: `Phone ${tag}`, category: 'Board', tags: [tag], content: 'text' } });

  await page.goto('/');
  const button = page.getByTestId('board-tags-more');
  await expect(button).toBeVisible();
  await expect(page.getByTestId('board-tags').getByRole('button', { pressed: false }).filter({ hasText: tag })).toBeHidden();
  const sort = await page.locator('#board-sort').boundingBox();
  const tags = await button.boundingBox();
  expect(Math.abs(sort.y - tags.y)).toBeLessThan(24);
  // Same height as the box with the order and the colors button, so the row reads as one.
  const box = await page.locator('#board-sort').locator('xpath=..').boundingBox();
  expect(Math.abs(box.height - tags.height)).toBeLessThanOrEqual(1);

  await button.click();
  await page.getByTestId('board-tags-filter').fill(tag);
  await page.getByTestId('board-tag-option').click();
  await expect(button).toContainText(tag);
  await expect(page.getByTestId('board-count')).toHaveText(/1 of 1$/i);
});

// However narrow the window, the chips stay in one row with "N more" and the box with the order: what does
// not fit goes behind "N more", never to a second line.
test('доска: теги всегда в одну строку, сколько влезло, столько и показано', async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => localStorage.setItem('noteView', 'board'));
  const stamp = Date.now();
  for (let i = 0; i < 9; i += 1) {
    await page.request.post('/api/notes/create', { data: { title: `Row ${i} ${stamp}`, category: 'Board', tags: [`длинныйтег${i}-${stamp}`], content: 'text' } });
  }
  for (const width of [1500, 1100, 900, 700]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const more = page.getByTestId('board-tags-more');
    await expect(more).toBeVisible();
    const tops = await page.getByTestId('board-tags').locator('button:visible').evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
    expect(new Set(tops).size, `в ${width}px все теги на одной строке`).toBe(1);
    // Nothing in the strip pushes the page sideways.
    const sideways = await page.evaluate(() => [...document.querySelectorAll('[data-board-scroll], main')].some((el) => el.scrollWidth > el.clientWidth + 1));
    expect(sideways, `в ${width}px нет горизонтальной прокрутки`).toBe(false);
  }
});
