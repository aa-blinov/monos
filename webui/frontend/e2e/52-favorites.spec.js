import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// Favorites are their own list under Tools, apart from the pinned notes: marked from the note's ··· menu,
// opened from the list, taken off with the star.
test('избранное: пометка в меню заметки, отдельный список, снятие звездой', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  const title = `Fav ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await page.getByTestId('editor-more').click();
  await page.getByTestId('menu-favorite').click();
  await expect(page.getByTestId('editor-more').first()).toBeVisible();

  await page.getByTestId('open-more').click();
  await page.getByTestId('open-favorites').click();
  const row = page.getByTestId('favorite-row').filter({ hasText: title });
  await expect(row).toHaveCount(1);
  // A favourite is not a pin: the pinned list of the sidebar does not hold it.
  await expect(page.getByTestId('pinned-list').getByText(title)).toHaveCount(0);

  await row.getByTestId('favorite-remove').click();
  await expect(row).toHaveCount(0);
});

// A note is unpinned from the main board itself: right click on its card, and the sidebar's list follows.
test('доска: ПКМ по карточке открепляет заметку и в боковой панели тоже', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  const title = `Board unpin ${Date.now()}`;
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } })).json();
  await page.request.put(`/api/file/metadata?path=${encodeURIComponent(created.path)}`, { data: { pinned: true } });
  await page.goto('/');
  const sidebarItem = page.getByTestId('pinned-list').getByRole('button', { name: new RegExp(title) });
  await expect(sidebarItem).toBeVisible();
  const marks = page.locator('main').getByTestId('card-pinned');
  const before = await marks.count();
  await page.locator('main [role=list]').getByText(title).first().click({ button: 'right' });
  await page.getByTestId('card-pin-toggle').click();
  await expect(sidebarItem).toHaveCount(0);
  await expect(marks).toHaveCount(before - 1);
});

// The Properties table appears in Tools as soon as a note has a property of its own.
test('инструменты: таблица свойств появляется, когда у заметки есть своё свойство', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  const created = await (await page.request.post('/api/notes/create', { data: { title: `Props ${Date.now()}`, category: 'Board', tags: [], content: 'text' } })).json();
  await page.request.put(`/api/file/property?path=${encodeURIComponent(created.path)}`, { data: { key: 'Jhopa', type: 'text', value: 'Piska' } });
  await page.goto('/');
  await page.getByTestId('open-more').click();
  await expect(page.getByTestId('open-properties')).toBeVisible();
});

// The Tools menu has many items now: on a short window it scrolls inside itself instead of leaving the screen.
test('меню «Инструменты» на низком окне не выходит за экран', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1300, height: 520 });
  await page.goto('/');
  await page.getByTestId('open-more').click();
  const menu = page.getByTestId('more-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(520);
});

// The More tools menu of the editor stays on the screen on a short window and a phone.
test('меню редактора «Ещё» не выходит за экран на телефоне', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 375, height: 560 });
  const title = `Menu fit ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await page.locator('[data-more-tools] button[aria-haspopup="menu"]').click();
  const box = await page.locator('[role="menu"]').first().boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(560);
});
