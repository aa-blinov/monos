import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test('автосинхронизация: по умолчанию каждые 15 минут с отправкой; выбор сохраняется и возвращается', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  await expect(page.locator('#auto-sync-minutes')).toHaveValue('15');
  await expect(page.locator('#git-auto-upload')).toBeChecked();
  await expect(page.locator('#git-auto-upload-quit')).not.toBeChecked();

  await page.locator('#git-auto-upload-quit').check();
  await page.locator('#auto-sync-minutes').fill('30');
  await page.locator('#auto-sync-minutes').press('Tab');
  await expect.poll(async () => {
    const saved = await (await page.request.get('/api/settings')).json();
    return { minutes: saved.git_auto_sync_minutes, quitUpload: saved.git_auto_upload_quit };
  }).toEqual({ minutes: 30, quitUpload: true });

  await page.locator('#git-auto-upload-quit').uncheck();
  await page.locator('#auto-sync-minutes').fill('15');
  await page.locator('#auto-sync-minutes').press('Tab');
  await expect.poll(async () => (await (await page.request.get('/api/settings')).json()).git_auto_sync_minutes).toBe(15);
});
