import { expect, test } from '@playwright/test';
import { openAdvancedSettings, prepareMonos, uniqueTitle } from './support/monos.js';

test('конфликтная копия из облака: видна в обслуживании, в корзину уходит после подтверждения', async ({ page }) => {
  await prepareMonos(page);
  const original = uniqueTitle('Plan');
  const copy = `${original} (conflicted copy 2026-10-15 MacBook)`;
  for (const [title, content] of [[original, 'Версия первая.'], [copy, 'Версия вторая.']]) {
    await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content } });
  }

  await page.goto('/settings');
  await openAdvancedSettings(page);
  const row = page.getByTestId('conflict-copies').locator('li').filter({ hasText: copy });
  await expect(row).toContainText(`Conflict copy of ${original}`);

  await row.getByTestId('conflict-copy-trash').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Move this copy to the trash?');
  await dialog.getByRole('button', { name: 'Move to trash', exact: true }).click();

  await expect(page.getByTestId('conflict-copies').locator('li').filter({ hasText: copy })).toHaveCount(0);
  await expect(page.getByTestId('conflict-copies').locator('li').filter({ hasText: original })).toHaveCount(0);
});
