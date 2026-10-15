import { expect, test } from '@playwright/test';
import { prepareMonos, uniqueTitle } from './support/monos.js';

test('заблокированная заметка не показывает текст, открывается парольной фразой и закрывается снова', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Sealed Note');
  const notePath = (await (await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: 'Тайный текст про сейф' },
  })).json()).path;
  const query = `?path=${encodeURIComponent(notePath)}`;

  // Sealed, then closed for this session: the next open asks for the passphrase.
  expect((await page.request.post(`/api/file/lock${query}`, { data: { passphrase: 'фраза-е2е' } })).status()).toBe(200);
  expect((await page.request.post(`/api/file/relock${query}`)).status()).toBe(200);

  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await expect(page.getByTestId('locked-overlay')).toBeVisible();
  await expect(page.getByTestId('locked-note')).toContainText('This note is locked');
  await expect(page.getByText('Тайный текст')).toHaveCount(0);

  const passphrase = page.getByLabel('Passphrase', { exact: true });
  await passphrase.fill('не та');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The passphrase is wrong');
  await expect(page.getByText('Тайный текст')).toHaveCount(0);

  await passphrase.fill('фраза-е2е');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByTestId('locked-overlay')).toHaveCount(0);
  await expect(page.locator('.ProseMirror').first()).toContainText('Тайный текст');
});
