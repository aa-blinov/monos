import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The Help opens from the sidebar, lists every topic, and its search jumps to the topic it found.
test('справка: открывается из боковой панели, ищет и переходит к теме', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await page.getByTestId('open-help').first().click();

  await expect(page).toHaveURL(/\/help$/);
  await expect(page.locator('#help-faq')).toBeAttached();
  await page.getByTestId('help-search').fill('passphrase');
  const results = page.getByTestId('help-results').locator('button');
  await expect(results.first()).toBeVisible();
  await results.filter({ hasText: 'I forgot' }).click();

  await expect(page.getByTestId('help-search')).toHaveValue('');
  await expect(page.locator('#help-faq-forgot-password')).toBeInViewport();
});
