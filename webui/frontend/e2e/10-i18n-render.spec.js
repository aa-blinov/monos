import { test, expect } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

async function prepareWithLocale(page, locale) {
  await prepareMonos(page);
  await page.addInitScript((loc) => {
    localStorage.setItem('locale', loc);
  }, locale);
}

test.describe('i18n rendering', () => {
  test('renders English UI strings', async ({ page }) => {
    await prepareWithLocale(page, 'en');
    await page.goto('/');

    await expect(page.getByRole('button', { name: /Open sidebar/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /New note/i }).first()).toBeVisible();
  });

  test('renders Russian UI strings', async ({ page }) => {
    await prepareWithLocale(page, 'ru');
    await page.goto('/');

    await expect(page.getByRole('button', { name: /Новая заметка/i }).first()).toBeVisible();
  });
});
