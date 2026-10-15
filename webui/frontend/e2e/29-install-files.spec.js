import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test('установка как приложения: манифест и иконки отдаются, страница на них ссылается', async ({ page }) => {
  await prepareMonos(page);
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe('Monos');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).status(), icon.src).toBe(200);
  }

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
});
