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
  // The chosen ones (status, priority) first, then the most used, eight in all, not eleven.
  await expect(page.locator('[role=group] button[aria-pressed]')).toHaveCount(8);
  await expect(page.locator('[role=group] button[aria-pressed]').first()).toContainText('status');
  await expect(page.getByTestId('properties-more-columns')).toContainText('3');
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

// The filter is still there after a note was opened and the back button pressed (real notes, no mocks).
test('таблица заметок: фильтр не теряется после возврата из заметки', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  const title = `Table back ${Date.now()}`;
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } })).json();
  await page.request.put(`/api/file/property?path=${encodeURIComponent(created.path)}`, { data: { key: 'status', type: 'text', value: 'done' } });
  await page.goto('/properties');
  await page.getByTestId('properties-query').fill(`prop:status=done ${title}`);
  await page.getByRole('button', { name: title }).click();
  await expect(page.getByTestId('editor-shell')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('properties-query')).toHaveValue(`prop:status=done ${title}`);
});

// A stateful table: PUT /api/file/property changes the rows the next read returns.
async function openEditable(page) {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 900 });
  const state = Array.from({ length: 40 }, (_, i) => row(i, [{ key: 'status', type: 'text', value: i % 2 ? 'done' : 'todo' }, ...(i % 3 ? [] : [{ key: 'priority', type: 'number', value: 2 }])]));
  const puts = [];
  const tableKeys = [{ key: 'status', count: 40, type: 'text' }, { key: 'priority', count: 14, type: 'number' }, { key: 'reviewed', count: 0, type: 'checkbox' }];
  await page.route('**/api/notes/table**', (route) => route.fulfill({ json: { rows: state, total: state.length, keys: tableKeys } }));
  await page.route('**/api/file/property**', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path');
    const body = JSON.parse(route.request().postData());
    puts.push({ path, body });
    const target = state.find((item) => item.path === path);
    target.properties = target.properties.filter((item) => item.key !== body.key);
    if (!body.remove) target.properties.push({ key: body.key, type: body.type, value: body.value });
    route.fulfill({ json: { path, properties: target.properties } });
  });
  await page.goto('/properties');
  await expect(page.getByTestId('properties-view')).toBeVisible();
  return { puts, state };
}

test('таблица заметок: правка ячейки на месте, Esc отменяет, сбой записи виден', async ({ page }) => {
  const { puts, state } = await openEditable(page);
  const cell = (r, c) => page.locator('tbody tr').nth(r).getByTestId('properties-cell').nth(c);
  await expect(cell(0, 0)).toHaveText('todo');
  await cell(0, 0).click();
  await page.getByTestId('properties-cell-input').fill('blocked');
  await page.keyboard.press('Enter');
  await expect(cell(0, 0)).toHaveText('blocked');
  expect(puts.at(-1)).toEqual({ path: 'notes/N0.md', body: { key: 'status', type: 'text', value: 'blocked' } });

  await cell(1, 0).click();
  await page.getByTestId('properties-cell-input').fill('nope');
  await page.keyboard.press('Escape');
  await expect(cell(1, 0)).toHaveText('done');
  expect(puts).toHaveLength(1);

  // A write that fails keeps the editor open and says so.
  await page.unroute('**/api/file/property**');
  await page.route('**/api/file/property**', (route) => route.fulfill({ status: 500, json: { detail: 'no' } }));
  await cell(1, 1).click();
  await page.getByTestId('properties-cell-input').fill('4');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('properties-cell-input')).toBeVisible();
  await page.unroute('**/api/file/property**');
  await page.route('**/api/file/property**', (route) => {
    const path = new URL(route.request().url()).searchParams.get('path');
    const body = JSON.parse(route.request().postData());
    puts.push({ path, body });
    const target = state.find((item) => item.path === path);
    target.properties = target.properties.filter((item) => item.key !== body.key);
    if (!body.remove) target.properties.push({ key: body.key, type: body.type, value: body.value });
    route.fulfill({ json: { path, properties: target.properties } });
  });
  await page.keyboard.press('Enter');
  await expect(cell(1, 1)).toHaveText('4');
  expect(puts.at(-1).body).toEqual({ key: 'priority', type: 'number', value: 4 });

  // Emptying a cell removes the property.
  await cell(0, 1).click();
  await page.getByTestId('properties-cell-input').fill('');
  await page.keyboard.press('Enter');
  await expect.poll(() => puts.at(-1).body).toEqual({ key: 'priority', remove: true });
});

test('таблица заметок: флажок переключается одним нажатием', async ({ page }) => {
  const { puts } = await openEditable(page);
  await page.locator('[role=group] button[aria-pressed]').filter({ hasText: 'reviewed' }).click();
  const idx = (await page.locator('thead th').count()) - 2;
  await page.locator('tbody tr').first().getByTestId('properties-cell').nth(idx - 1).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0].body).toEqual({ key: 'reviewed', type: 'checkbox', value: true });
});

test('таблица заметок: заголовок и колонка «Заметка» закреплены при прокрутке', async ({ page }) => {
  await openEditable(page);
  const scroller = page.getByTestId('properties-scroller');
  await scroller.evaluate((el) => { el.scrollTop = 400; });
  await page.waitForTimeout(200);
  const [head, box] = [await page.locator('thead').boundingBox(), await scroller.boundingBox()];
  expect(Math.abs(head.y - box.y)).toBeLessThan(3);
  const [first, scrollerBox] = [await page.locator('tbody tr').nth(8).locator('td').first().boundingBox(), box];
  expect(first.x).toBeGreaterThanOrEqual(scrollerBox.x - 1);
});

test('таблица заметок: подсказки в фильтре — сначала поля, потом значения', async ({ page }) => {
  await openEditable(page);
  const input = page.getByTestId('properties-query');
  await input.click();
  await input.fill('prop:sta');
  await page.getByTestId('properties-suggestion').filter({ hasText: 'status' }).click();
  await expect(input).toHaveValue('prop:status=');
  await expect(page.getByTestId('properties-suggestion').filter({ hasText: 'done' })).toBeVisible();
  await page.getByTestId('properties-suggestion').filter({ hasText: 'done' }).click();
  await expect(input).toHaveValue('prop:status=done ');
});
