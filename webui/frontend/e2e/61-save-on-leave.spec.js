import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// In a browser the autosave timer dies with the page, and the last second of typing was lost on a reload.
test('текст, набранный за секунду до перезагрузки, остаётся в файле', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const title = `Leave ${Date.now()}`;
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: 'Leave', tags: [], content: 'Start' } })).json();
  const query = `path=${encodeURIComponent(created.path)}`;
  await page.goto(`/notes/${created.path.replace(/^notes\//, '').split('/').map(encodeURIComponent).join('/')}`);
  const editor = page.getByTestId('rich-editor-input');
  await expect(editor.locator('p').first()).toContainText('Start');
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' typed just before leaving');

  // The browser asks "leave this page?" while the note is unsaved; the person leaves.
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect.poll(async () => String((await (await page.request.get(`/api/file?${query}`)).json()).content), { timeout: 8000 })
    .toContain('Start typed just before leaving');
  await expect(page.getByTestId('rich-editor-input').locator('p').first()).toContainText('typed just before leaving');
});
