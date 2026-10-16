import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The device's name is what other devices see in a note's history and in a conflict. It is asked once,
// on first launch, with the computer's own name already filled in.
test('при первом запуске спрашивается имя устройства, и больше не спрашивается', async ({ page }) => {
  await prepareMonos(page);
  await page.request.post('/api/settings', { data: { device_name: '' } });
  await page.goto('/');

  const prompt = page.getByTestId('device-name-prompt');
  await expect(prompt).toBeVisible();
  const field = page.getByLabel('Device name');
  await expect(field).not.toHaveValue('');
  await field.fill('Work laptop');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(prompt).toBeHidden();
  expect((await (await page.request.get('/api/device')).json()).name).toBe('Work laptop');

  await page.reload();
  await expect(page.locator('main')).toBeVisible();
  await expect(prompt).toHaveCount(0);

  await page.goto('/settings');
  await expect(page.locator('#device-name')).toHaveValue('Work laptop');
});

test('закрыть вопрос значит оставить предложенное имя', async ({ page }) => {
  await prepareMonos(page);
  await page.request.post('/api/settings', { data: { device_name: '' } });
  await page.goto('/');
  await expect(page.getByTestId('device-name-prompt')).toBeVisible();
  const suggested = await page.getByLabel('Device name').inputValue();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('device-name-prompt')).toBeHidden();
  expect((await (await page.request.get('/api/device')).json()).name).toBe(suggested);
  await page.request.post('/api/device', { data: { name: 'E2E' } });
});
