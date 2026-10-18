import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The bottom block of the phone's menu (Tools items, Trash, Help, Settings) scrolls inside itself on a short
// screen, so Settings is always reachable.
test('меню слева на низком телефоне: «Настройки» достижимы прокруткой', async ({ page }) => {
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
