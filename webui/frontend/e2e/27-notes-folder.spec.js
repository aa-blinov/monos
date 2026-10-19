import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test('папка заметок: видно, где лежат заметки; выбор в браузере объясняет, где его сделать', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');

  const section = page.getByTestId('storage-section');
  await expect(section.getByRole('heading', { name: 'Notes folder' })).toBeVisible();
  await expect(page.getByTestId('storage-folder')).toContainText('notes');
  await expect(page.getByTestId('storage-reset')).toHaveCount(0);

  await page.getByTestId('storage-choose').click();
  await expect(section.getByRole('alert')).toContainText('The folder can be chosen in the Monos app');
});
