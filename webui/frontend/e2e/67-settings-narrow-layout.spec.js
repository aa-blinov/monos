import { expect, test } from '@playwright/test';
import { openAdvancedSettings, prepareMonos } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

test('настройки на телефоне: полоса частей показывает, что она длиннее экрана, и заголовок не прилипает к ней', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  const nav = page.getByTestId('settings-nav');
  await expect(nav).toBeVisible();
  // The strip runs past the screen, and the edge it runs past fades out.
  expect(await nav.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await nav.evaluate((node) => getComputedStyle(node).maskImage || getComputedStyle(node).webkitMaskImage)).not.toBe('none');

  await nav.getByRole('button').nth(2).click();
  await page.waitForTimeout(1200);
  const gap = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="settings-nav"]').getBoundingClientRect();
    const section = document.getElementById('settings-sync').getBoundingClientRect();
    return section.top - strip.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(8);
});

test('настройки: линия над разделом ровная, без скруглённых концов', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/settings');
  for (const id of ['settings-data', 'settings-sync']) {
    expect(await page.locator(`#${id}`).evaluate((node) => getComputedStyle(node).borderTopLeftRadius)).toBe('0px');
  }
});

test('строка конфликтной копии в настройках не обрезана слева', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stem = `Plan ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title: stem, category: 'Copies', tags: [], content: 'same' } });
  await page.request.post('/api/notes/create', { data: { title: `${stem} (conflicted copy 2026-10-15 MacBook)`, category: 'Copies', tags: [], content: 'same' } });
  await page.goto('/settings');
  await openAdvancedSettings(page);
  const row = page.getByTestId('conflict-copies').locator('li').filter({ hasText: stem }).first();
  await row.scrollIntoViewIfNeeded();
  const button = row.getByRole('button').first();
  const [rowBox, textBox] = await Promise.all([row.boundingBox(), button.locator('span').last().boundingBox()]);
  expect(textBox.x).toBeGreaterThanOrEqual(rowBox.x);
  // A long title ends with an ellipsis instead of running off the edge.
  expect(await button.locator('span').last().evaluate((node) => getComputedStyle(node).textOverflow)).toBe('ellipsis');
});

test('длинные названия в «Заметках без ссылок» обрезаются многоточием', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const title = `Lonely ${Date.now()} a very long note title that goes on and on and on past the end of the line`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Copies', tags: [], content: 'nobody links here' } });
  await page.goto('/settings');
  await openAdvancedSettings(page);
  const row = page.getByTestId('orphan-notes').getByRole('button', { name: new RegExp(title.slice(0, 20)) }).first();
  await row.scrollIntoViewIfNeeded();
  const label = row.locator('span').last();
  expect(await label.evaluate((node) => getComputedStyle(node).textOverflow)).toBe('ellipsis');
  expect(await label.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
});

test('крупный шрифт интерфейса: названия палитр не обрезаются', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.request.post('/api/settings', { data: { fontSize: 'xlarge', locale: 'ru' } });
  await page.addInitScript(() => { localStorage.setItem('fontSize', 'xlarge'); localStorage.setItem('locale', 'ru'); });
  try {
    await page.goto('/settings');
    const names = page.getByTestId('appearance-section').locator('button[aria-pressed] span.truncate');
    await expect(names).toHaveCount(6);
    const cut = await names.evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth).map((node) => node.textContent));
    expect(cut).toEqual([]);
  } finally {
    await page.request.post('/api/settings', { data: { fontSize: 'medium', locale: 'en' } });
  }
});

test('подсказка в поле владельца короткая и в русском, и в английском', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ['ru', 'en']) {
    await page.request.post('/api/settings', { data: { locale } });
    await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
    await page.goto('/settings');
    const placeholder = await page.locator('#git-owner').getAttribute('placeholder');
    expect(placeholder.length).toBeLessThanOrEqual(24);
  }
  await page.request.post('/api/settings', { data: { locale: 'en' } });
});
