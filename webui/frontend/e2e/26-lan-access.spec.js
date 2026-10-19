import { expect, test } from '@playwright/test';
import { openAdvancedSettings, prepareMonos } from './support/monos.js';

test('телефон и другие устройства: доступ включается и выключается, новый токен берётся после подтверждения', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  await openAdvancedSettings(page);

  const section = page.getByTestId('lan-section');
  await expect(section.getByRole('heading', { name: 'Phone and other devices' })).toBeVisible();
  const toggle = section.getByRole('checkbox');
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId('lan-renew')).toHaveCount(0);

  // A new address works only after a restart, and the page says so.
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(section.getByText('Restart Monos for the change to take effect')).toBeVisible();
  await expect(page.getByTestId('lan-renew')).toBeVisible();

  await page.getByTestId('lan-renew').click();
  await expect(page.getByText('Make a new token?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Make a new token?')).toHaveCount(0);

  await page.getByTestId('lan-renew').click();
  await page.getByRole('button', { name: 'Make token', exact: true }).click();
  await expect(page.getByText('Make a new token?')).toHaveCount(0);
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId('lan-renew')).toHaveCount(0);
});
