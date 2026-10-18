import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

const row = (i, props) => ({ path: `notes/N${i}.md`, title: `Note ${i}`, category: '', tags: [], modified: '2026-10-01T10:00:00.000Z', properties: props });
const keys = [
  ...Array.from({ length: 9 }, (_, i) => ({ key: `copilot-key-${i}`, count: 20 - i, type: 'text' })),
  { key: 'status', count: 5, type: 'text' },
  { key: 'priority', count: 4, type: 'number' },
];

async function open(page, { rows, total = rows.length } = {}) {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.route('**/api/notes/table**', (route) => route.fulfill({ json: { rows, total, keys } }));
  await page.goto('/properties');
  await expect(page.getByTestId('properties-view')).toBeVisible();
}

// Well-known fields lead the columns even when plugin keys are more numerous; the rest wait behind "N more".
test('таблица заметок: колонки по умолчанию — известные поля, остальные за «Ещё N»', async ({ page }) => {
  await open(page, { rows: [row(1, [{ key: 'status', type: 'text', value: 'done' }])] });
  const headers = page.locator('thead th');
  await expect(headers.nth(1)).toHaveText('status');
  await expect(headers.nth(2)).toHaveText('priority');
  // The eight most used keys and the two chosen ones (status, priority), not all eleven.
  await expect(page.locator('[role=group] button[aria-pressed]')).toHaveCount(10);
  await expect(page.getByTestId('properties-more-columns')).toContainText('1');
  await page.getByTestId('properties-more-columns').click();
  await page.getByTestId('properties-column-search').fill('copilot-key-8');
  await expect(page.locator('[role=group] button[aria-pressed]')).toHaveCount(1);
});

// The sort and the columns survive a reload.
test('таблица заметок: сортировка и колонки запоминаются', async ({ page }) => {
  await open(page, { rows: [row(1, []), row(2, [])] });
  await page.locator('thead').getByRole('button', { name: 'status' }).click();
  await page.locator('[role=group] button[aria-pressed]').filter({ hasText: 'priority' }).click();
  await page.reload();
  await expect(page.locator('thead th').filter({ hasText: 'priority' })).toHaveCount(0);
  await expect(page.locator('thead th[aria-sort="ascending"]')).toContainText('status');
});

// A table cut at its row limit says so, instead of looking complete.
test('таблица заметок: если строк больше лимита, под таблицей сказано сколько показано', async ({ page }) => {
  await open(page, { rows: [row(1, [])], total: 480 });
  await expect(page.getByTestId('properties-total')).toContainText('1 of 480');
});

// The filter is still there after a note was opened and the back button pressed.
test('таблица заметок: фильтр не теряется после возврата из заметки', async ({ page }) => {
  await open(page, { rows: [row(1, [{ key: 'status', type: 'text', value: 'done' }])] });
  await page.getByTestId('properties-query').fill('prop:status=done');
  await page.waitForTimeout(400);
  await page.locator('tbody tr button').first().click();
  await page.goBack();
  await expect(page.getByTestId('properties-query')).toHaveValue('prop:status=done');
});
