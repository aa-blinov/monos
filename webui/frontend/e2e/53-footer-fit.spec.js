import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The phone's foot is three rows now, so Settings stays in reach even on a short screen.
test('меню слева на низком телефоне: «Настройки» на месте', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto('/');
  await page.getByRole('button', { name: /Open sidebar/ }).first().click();
  const settings = page.getByRole('button', { name: 'Settings', exact: true }).last();
  await settings.scrollIntoViewIfNeeded();
  const box = await settings.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(420);
  await settings.click();
  await expect(page.getByTestId('storage-section')).toBeVisible();
});

// The list of Settings parts follows the page to its very end, and a chosen part stays marked.
test('настройки: внизу страницы отмечена последняя часть, выбранная часть остаётся отмеченной', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  const nav = page.getByTestId('settings-nav');
  const buttons = nav.getByRole('button');
  const count = await buttons.count();
  await page.evaluate(() => { const sc = document.querySelector('main [class*="overflow-y-auto"]'); sc.scrollTop = sc.scrollHeight; });
  await expect(buttons.nth(count - 1)).toHaveAttribute('aria-current', 'true');
  await buttons.nth(count - 2).click();
  await page.waitForTimeout(1300);
  await expect(buttons.nth(count - 2)).toHaveAttribute('aria-current', 'true');
  await buttons.nth(0).click();
  await page.waitForTimeout(1300);
  await expect(buttons.nth(0)).toHaveAttribute('aria-current', 'true');
});

// Narrow window: the strip keeps the marked part in sight, so the list does not seem to fly away to the left.
test('настройки на узком окне: отмеченная часть всегда видна в полосе', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/settings');
  const nav = page.getByTestId('settings-nav');
  const buttons = nav.getByRole('button');
  const count = await buttons.count();
  await buttons.nth(count - 1).click();
  await page.waitForTimeout(1300);
  const visible = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="settings-nav"]');
    const mark = strip.querySelector('[aria-current="true"]');
    const s = strip.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    return m.left >= s.left - 1 && m.right <= s.right + 1;
  });
  expect(visible).toBe(true);
});
