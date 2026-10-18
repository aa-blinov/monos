import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

async function openNote(page, width) {
  await page.setViewportSize({ width, height: 800 });
  const title = `Toolbar ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await expect(page.getByTestId('rich-editor-surface')).toBeVisible();
}

// The rarer tools sit in the toolbar while it has room and move into the "More tools" menu as it narrows.
test('панель форматирования: что влезает, то на виду, остальное в меню', async ({ page }) => {
  await prepareMonos(page);
  await openNote(page, 1600);
  const more = page.locator('[data-more-tools] button[aria-haspopup="menu"]');
  await expect(page.getByTestId('toolbar-extras').getByRole('button')).toHaveCount(6);
  await more.click();
  await expect(page.getByRole('menuitem')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 560, height: 800 });
  await expect.poll(async () => page.getByTestId('toolbar-extras').getByRole('button').count()).toBeLessThan(6);
  await more.click();
  const shown = await page.getByTestId('toolbar-extras').getByRole('button').count();
  await expect(page.getByRole('menuitem')).toHaveCount(6 - shown);
});

// In the menu a click anywhere on a row's line opens its list, not only on the icon.
test('меню «Ещё»: строка настройки открывается по клику в любом месте строки', async ({ page }) => {
  await prepareMonos(page);
  await openNote(page, 1000);
  await page.locator('[data-more-tools] button[aria-haspopup="menu"]').click();
  const row = page.locator('[role="menu"] label').first();
  const box = await row.boundingBox();
  // The right end of the row, far from the icon.
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: box.x + box.width - 8, y: box.y + box.height / 2 });
  expect(hit).toBe('SELECT');
});

// Pinned notes fold to one row, and a long list scrolls inside a third of the panel instead of taking all of it.
test('закреплённые: сворачиваются, а длинный список не съедает панель', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  const stamp = Date.now();
  for (let i = 0; i < 12; i += 1) {
    const created = await (await page.request.post('/api/notes/create', { data: { title: `Pin ${stamp} ${i}`, category: 'Board', tags: [], content: 'text' } })).json();
    await page.request.put(`/api/file/metadata?path=${encodeURIComponent(created.path)}`, { data: { pinned: true } });
  }
  await page.goto('/');
  const list = page.getByTestId('pinned-list');
  await expect(list).toBeVisible();
  const height = (await list.boundingBox()).height;
  expect(height).toBeLessThanOrEqual(800 * 0.33);
  await page.getByTestId('pinned-toggle').click();
  await expect(list).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('pinned-list')).toBeHidden();
  await page.getByTestId('pinned-toggle').click();
  await expect(page.getByTestId('pinned-list')).toBeVisible();
});

// The language list of a code block opens: the toolbar keeps the editor's focus on button presses, but a
// press on the list itself must not be cancelled, or the browser never shows it.
test('блок кода: выпадашка языка не гасит нажатие и меняет язык', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  const title = `Code ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: '```js\nlet a = 1\n```\n' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await page.locator('.ProseMirror pre').click();
  const select = page.getByLabel('Language');
  await expect(select).toBeVisible();
  const prevented = await select.evaluate((el) => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await select.selectOption('swift');
  await expect(page.locator('.ProseMirror pre code')).toHaveClass(/language-swift/);
});

// A pin taken off in the sidebar (right click on it) leaves the board at once, without a reload.
test('закреплённые: ПКМ открепляет, и доска сразу согласна с боковой панелью', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  const stamp = Date.now();
  const created = await (await page.request.post('/api/notes/create', { data: { title: `Sync ${stamp}`, category: 'Board', tags: [], content: 'text' } })).json();
  await page.request.put(`/api/file/metadata?path=${encodeURIComponent(created.path)}`, { data: { pinned: true } });
  await page.goto('/');
  const pinnedItem = page.getByTestId('pinned-list').getByRole('button', { name: new RegExp(`Sync ${stamp}`) });
  await expect(pinnedItem).toBeVisible();
  const marks = page.getByTestId('card-pinned');
  await expect(marks.first()).toBeVisible();
  const before = await marks.count();
  await pinnedItem.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Unpin Note' }).click();
  await expect(pinnedItem).toHaveCount(0);
  await expect(marks).toHaveCount(before - 1);
});
