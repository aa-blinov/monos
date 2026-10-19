import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The history is a timeline: days as headings, a dot per version on one rail, the newest on top and marked.
test('история: версии лежат на таймлайне по дням, новейшая помечена', async ({ page }, testInfo) => {
  await prepareMonos(page);
  const day = (offset, hour) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - offset, hour, 5).toISOString();
  const revisions = [
    { sha: 'a1', short: 'a1b2c3d', author: 'Laptop', date: day(0, 14), message: 'Monos: synced' },
    { sha: 'b2', short: 'b2c3d4e', author: 'Phone', date: day(0, 9), message: 'Monos: merged' },
    { sha: 'c3', short: 'c3d4e5f', author: 'Laptop', date: day(1, 20), message: 'Monos: synced' },
    { sha: 'd4', short: 'd4e5f6a', author: 'Laptop', date: day(9, 8), message: 'Monos: agent' },
  ];
  await page.route('**/api/git/history?**', (route) => route.fulfill({ json: { tracked: true, revisions } }));
  await page.route('**/api/git/history/content?**', (route) => route.fulfill({ json: { changed: true, diff: '@@ -1 +1 @@\n-old\n+new' } }));
  const title = `Timeline ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await page.getByTestId('footer-history').click();
  await expect(page.getByTestId('history-revision')).toHaveCount(4);
  await expect(page.getByTestId('history-day')).toHaveText(['Today', 'Yesterday', /\d{4}/]);
  await expect(page.getByTestId('history-timeline')).toContainText('Newest');
  await page.getByTestId('history-revision').nth(2).click();
  await expect(page.getByTestId('history-revision').nth(2)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('timeline.png') });
});
