import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, test } from '@playwright/test';
import { prepareMonos, uniqueTitle } from './support/monos.js';

test('публикация: сайт записывается в выбранную папку, сообщение называет её', async ({ page }) => {
  await prepareMonos(page);
  const title = uniqueTitle('Site Note');
  await page.request.post('/api/notes/create', {
    data: { title, category: '', tags: [], content: 'Страница сайта. См. [[Нет такой]].' },
  });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-e2e-site-'));

  await page.goto('/settings');
  await page.getByTestId('publish-folder').fill(outside);
  await page.getByTestId('publish-button').click();

  await expect(page.getByRole('status')).toContainText('Published');
  await expect(page.getByRole('status')).toContainText(path.join(outside, 'monos-site'));
  expect(fs.existsSync(path.join(outside, 'monos-site', 'index.html'))).toBe(true);
  const index = fs.readFileSync(path.join(outside, 'monos-site', 'index.html'), 'utf-8');
  expect(index).toContain(title);
});
