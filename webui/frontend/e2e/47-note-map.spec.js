import { expect, test } from '@playwright/test';
import { openNote, openSidebarMore, prepareMonos, uniqueTitle } from './support/monos.js';

// The map of notes and a note's relations. A hub links to one note ("out"), is linked from another ("in") and
// linked both ways with a third; it also names a note that does not exist.
async function seed(page) {
  const stamp = uniqueTitle('Map');
  const names = { hub: `${stamp} Hub`, out: `${stamp} Out`, inn: `${stamp} In`, both: `${stamp} Both`, ghost: `${stamp} Ghost` };
  const make = (title, content) => page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content } });
  await make(names.out, 'target of the hub');
  await make(names.both, `back to [[${names.hub}]]`);
  await make(names.inn, `points at [[${names.hub}]]`);
  await make(names.hub, `[[${names.out}]] [[${names.both}]] [[${names.ghost}]]`);
  return names;
}

test.beforeEach(async ({ page }) => { await prepareMonos(page); });

test('карта открывается из меню «Инструменты», рисует заметки, поиск находит и открывает заметку', async ({ page }) => {
  const names = await seed(page);
  await page.goto('/');
  await openSidebarMore(page);
  await page.getByTestId('open-map').click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.getByTestId('note-map')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Map' })).toBeVisible();
  await expect(page.getByTestId('map-counts')).toContainText(/\d+ notes, \d+ links/);

  // Something is drawn: the canvas holds coloured pixels.
  await expect.poll(async () => page.getByTestId('map-canvas').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return painted;
  })).toBeGreaterThan(200);

  await page.getByTestId('map-search').fill(names.hub);
  await expect(page.getByTestId('map-result').first()).toContainText(names.hub);
  await page.getByTestId('map-result').first().click();
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.getByRole('heading', { level: 1, name: names.hub })).toHaveCount(1);
});

test('палитра команд открывает карту', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('dialog').getByRole('combobox').fill('map');
  await page.getByRole('option', { name: /map of notes/i }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.getByTestId('note-map')).toBeVisible();
});

test('в связанных заметке у каждой строки видно, в какую сторону идёт ссылка; есть пропавшие ссылки', async ({ page }) => {
  const names = await seed(page);
  await openNote(page, names.hub);
  await page.getByTestId('property-related-button').click();
  const row = (title) => page.getByTestId('related-row').filter({ hasText: title });
  await expect(row(names.out)).toHaveAttribute('data-relation', 'out');
  await expect(row(names.inn)).toHaveAttribute('data-relation', 'in');
  await expect(row(names.both)).toHaveAttribute('data-relation', 'both');
  await expect(row(names.out)).toContainText('links from here');
  await expect(row(names.inn)).toContainText('links to here');
  await expect(row(names.both)).toContainText('both ways');
  await expect(page.getByTestId('related-missing')).toContainText(names.ghost);
  // Two-way first, then outgoing, then incoming.
  const order = await page.getByTestId('related-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-relation')));
  expect(order.indexOf('both')).toBeLessThan(order.indexOf('out'));
  expect(order.indexOf('out')).toBeLessThan(order.indexOf('in'));
  // A neighbour in the little graph opens its note.
  await page.getByTestId('local-graph-node').first().click();
  await expect(page).toHaveURL(/\/notes\//);
});

test('«Показать на карте» из заметки центрирует карту на ней; точка по клику открывает заметку; «Показать все» снимает фокус', async ({ page }) => {
  const names = await seed(page);
  await openNote(page, names.hub);
  await page.getByTestId('property-related-button').click();
  await page.getByTestId('show-on-map').click();
  await expect(page).toHaveURL(/\/map\?focus=/);
  await expect(page.getByTestId('map-focus')).toContainText(`Around ${names.hub}`);

  // The note in focus is a dot at a known place on the canvas: click it.
  const wrapper = page.locator('[data-focus-screen]');
  await expect.poll(async () => wrapper.getAttribute('data-focus-screen')).toMatch(/^-?\d+,-?\d+$/);
  const [x, y] = (await wrapper.getAttribute('data-focus-screen')).split(',').map(Number);
  const box = await page.getByTestId('map-canvas').boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.getByRole('heading', { level: 1, name: names.hub })).toHaveCount(1);

  await page.goBack();
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByTestId('map-focus')).toHaveCount(0);
  await expect(page).toHaveURL(/\/map$/);
});

test('заметки без связей: флажок виден, включение просит карту с ними', async ({ page }) => {
  await page.request.post('/api/notes/create', { data: { title: uniqueTitle('Lonely'), category: '', tags: [], content: 'no links here' } });
  await page.goto('/map');
  const toggle = page.getByLabel(/Notes without links/);
  await expect(toggle).toBeVisible();
  const request = page.waitForRequest((r) => r.url().includes('/api/graph') && r.url().includes('orphans=1'));
  await toggle.check();
  await request;
});

test('пустая карта и ошибка загрузки говорят, что делать', async ({ page }) => {
  await page.route('**/api/graph**', (route) => route.fulfill({ json: { nodes: [], edges: [], noteCount: 3, orphanCount: 0, truncated: false } }));
  await page.goto('/map');
  await expect(page.getByTestId('map-empty')).toContainText('No links between notes yet');
  await expect(page.getByTestId('map-empty')).toContainText('[[');

  await page.unroute('**/api/graph**');
  await page.route('**/api/graph**', (route) => route.fulfill({ status: 500, json: { detail: 'boom' } }));
  await page.goto('/map');
  await expect(page.getByRole('alert')).toContainText('The map could not be loaded.');
  await page.unroute('**/api/graph**');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('map-counts')).toBeVisible();
});

test('на телефоне карта помещается: поиск, кнопки и поле, без горизонтальной прокрутки', async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/map');
  await expect(page.getByTestId('map-search')).toBeVisible();
  const box = await page.getByTestId('map-canvas').boundingBox();
  expect(box.height).toBeGreaterThan(250);
  expect(box.width).toBeGreaterThan(300);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(sideways).toBe(false);
  await expect(page.getByRole('button', { name: 'Fit to screen' })).toBeVisible();
});
