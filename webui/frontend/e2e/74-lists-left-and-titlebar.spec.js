import { expect, test } from '@playwright/test';
import { prepareMonos, uniqueTitle } from './support/monos.js';

test('список тегов на доске: названия у левого края, а не посередине', async ({ page }) => {
  await prepareMonos(page);
  await page.request.post('/api/notes/create', { data: { title: uniqueTitle('Tagged'), category: '', tags: ['travel', 'food'], content: 'x' } });
  await page.setViewportSize({ width: 420, height: 800 });
  await page.goto('/');
  await page.getByTestId('board-tags-more').click();
  const option = page.getByTestId('board-tag-option').first();
  await expect(option).toBeVisible();
  // The label sits in a box stretched over the row, and a button centres its text: the box must say otherwise.
  const align = await option.locator('span.truncate > span.truncate').evaluate((label) => getComputedStyle(label).textAlign);
  expect(['left', 'start']).toContain(align);
});

test('настройки синхронизации: флажки друг под другом', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  const first = await page.locator('#git-auto-upload').boundingBox();
  const second = await page.locator('#git-auto-upload-quit').boundingBox();
  expect(second.y).toBeGreaterThan(first.y + first.height - 1);
});

test('окно с собственной полосой: боковая панель телефона начинается под ней, крестик не на кнопках окна', async ({ page }) => {
  await prepareMonos(page);
  await page.addInitScript(() => {
    window.monosWindow = { customTitleBar: true, platform: 'darwin', setTitleBarColors() {}, onFullScreen: () => () => {} };
  });
  await page.setViewportSize({ width: 420, height: 800 });
  await page.goto('/');
  const strip = await page.getByTestId('title-bar').boundingBox();
  await page.getByTestId('sidebar-shell').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: /^(Open sidebar|Открыть боковую панель)$/ }).first().click();
  await expect.poll(async () => (await page.getByTestId('sidebar-shell').boundingBox())?.y).toBeGreaterThanOrEqual(strip.y + strip.height);
});
