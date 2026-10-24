import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// The card's menu used to open from the keyboard (the Menu key, Shift+F10) with focus left on the card.
test('меню карточки доски управляется с клавиатуры', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const title = `Menu ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  const card = page.locator('main').getByRole('button', { name: new RegExp(`^${title}`) }).first();
  await card.focus();

  for (const key of ['ContextMenu']) {
    await page.keyboard.press(key);
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const items = menu.getByRole('menuitem');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('End');
    expect(await menu.evaluate((node) => node.contains(document.activeElement) && document.activeElement !== node.querySelector('button'))).toBe(true);
    await page.keyboard.press('Home');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(card).toBeFocused();
  }
});

test('меню карточки по правому клику закрывается по Esc', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.request.post('/api/notes/create', { data: { title: 'Menu mouse', category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  await page.locator('main').getByRole('button', { name: /^Menu mouse/ }).first().click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});
