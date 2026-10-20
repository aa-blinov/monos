import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test('переключение языка в настройках меняет подписи сразу и сохраняется', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await page.locator('#interface-language').selectOption('ru');

  // Подпись в футере — проверка, что интерфейс перерисован без перезагрузки.
  await expect(page.getByRole('button', { name: 'Настройки', exact: true }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('locale'))).toBe('ru');
  // Язык документа следует за языком интерфейса: так его читает синтезатор речи.
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  const settings = await (await page.request.get('/api/settings')).json();
  expect(settings.locale).toBe('ru');
});
