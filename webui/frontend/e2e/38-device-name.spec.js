import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The device's name is what other devices see in a note's history and in a conflict. It matters once sync is
// connected, so it is not asked on first launch: the computer's own name is filled in beside the GitHub
// connection, to keep or change there.
test('при первом запуске имя устройства не спрашивается, а в подключении GitHub уже подставлено', async ({ page }) => {
  await prepareMonos(page);
  await page.request.post('/api/settings', { data: { device_name: '' } });
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByTestId('device-name-prompt')).toHaveCount(0);

  await page.goto('/settings');
  const field = page.locator('#device-name');
  await expect(field).not.toHaveValue('');
  await field.fill('Work laptop');
  await field.blur();
  await expect.poll(async () => (await (await page.request.get('/api/device')).json()).name).toBe('Work laptop');
  await page.request.post('/api/device', { data: { name: 'E2E' } });
});

test('первый запуск: «Подключить GitHub» и «Выбрать папку» открывают свой раздел настроек', async ({ page }) => {
  await prepareMonos(page);
  await page.route('**/api/notes/recent**', (route) => route.fulfill({ json: [] }));
  await page.goto('/');

  const welcome = page.getByTestId('first-run-welcome');
  await expect(welcome.getByRole('heading', { name: 'Where to start' })).toBeVisible();
  await welcome.getByRole('button', { name: 'Connect GitHub' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('sync-section')).toBeInViewport();

  await page.goto('/');
  await welcome.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('storage-section')).toBeInViewport();
});
