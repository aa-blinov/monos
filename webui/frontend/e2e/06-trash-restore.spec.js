import { expect, test } from '@playwright/test';
import { prepareMonos, uniqueTitle } from './support/monos.js';

test('restores a trashed note and opens it', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Trash Restore');
  const createResponse = await page.request.post('/api/notes/create', {
    data: {
      title,
      category: '',
      tags: [],
      content: `# ${title}\n\nRestore me.`,
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const created = await createResponse.json();
  const noteColor = '#fb4934';

  const colorResponse = await page.request.post(`/api/directory/icon?path=${encodeURIComponent(created.path)}`, {
    data: { color: noteColor },
  });
  expect(colorResponse.ok()).toBeTruthy();

  const deleteResponse = await page.request.delete(`/api/file?path=${encodeURIComponent(created.path)}`);
  expect(deleteResponse.ok()).toBeTruthy();

  await page.goto('/trash');
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Restore' }).first().click();

  await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname))
    .toBe(`/notes/${created.path.replace(/^notes\//, '')}`);
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(title);

  const restoredInfo = await page.request.get(`/api/file-info?path=${encodeURIComponent(created.path)}`);
  expect(restoredInfo.ok()).toBeTruthy();
  expect((await restoredInfo.json()).color).toBe(noteColor);
});
