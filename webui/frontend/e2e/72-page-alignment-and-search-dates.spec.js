import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

test('настройки: пункты колонки частей прижаты к левому краю, а не стоят по центру', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  const nav = page.getByTestId('settings-nav');
  await expect(nav).toBeVisible();
  // The text itself, not its box: the box of a label fills the button either way, and only the text moves.
  const lefts = await nav.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const range = document.createRange();
    range.selectNodeContents(walker.nextNode());
    return Math.round(range.getBoundingClientRect().left);
  }));
  expect(lefts.length).toBeGreaterThan(3);
  expect(new Set(lefts).size).toBe(1);
});

test('страницы начинаются с одного левого края: избранное и «не найдено» не уходят в центр', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const lefts = [];
  for (const route of ['/trash', '/favorites', '/this-page-does-not-exist']) {
    await page.goto(route);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    lefts.push(Math.round((await heading.boundingBox()).x));
  }
  expect(new Set(lefts).size).toBe(1);
});

test('поиск: карточка результата показывает дату изменения заметки, а не время, когда её увидел индекс', async ({ page }) => {
  const found = await page.request.post('/api/search', { data: { query: 'Welcome', limit: 5 } });
  const [first] = await found.json();
  expect(first.modified).toBeTruthy();
});

for (const width of [1024, 1100]) {
  test(`настройки на ширине ${width}: названия цветовых тем не обрезаются многоточием`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/settings');
    await expect(page.getByTestId('settings-nav')).toBeVisible();
    const cut = await page.evaluate(() => [...document.querySelectorAll('#settings-appearance *')]
      .filter((node) => node.children.length === 0 && node.textContent.trim() && node.scrollWidth > node.clientWidth + 1
        && getComputedStyle(node).textOverflow === 'ellipsis')
      .map((node) => node.textContent.trim()));
    expect(cut).toEqual([]);
  });
}

test('доска: заметка, ушедшая в корзину сразу после создания, пропадает с доски и не даёт ошибку в консоли', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /new note/i }).first().click();
  await page.locator('#create-note-title').fill('Audit race');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/notes\/Audit/);
  await page.getByRole('button', { name: 'Move to trash' }).last().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /^Audit race/ })).toHaveCount(0);
  expect(errors.filter((text) => /hydrate|410/i.test(text))).toEqual([]);
});

test('доска: папка, удалённая из боковой панели, уносит с доски карточки своих заметок', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  const created = await page.request.post('/api/notes/create', { data: { title: 'Folder card', category: 'Audit Folder', tags: [], content: 'Text in the folder.' } });
  expect(created.ok()).toBeTruthy();
  await page.goto('/');
  const card = page.getByRole('button', { name: /^Folder card/ });
  await expect(card.first()).toBeVisible();
  await page.getByRole('button', { name: 'Audit Folder', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(errors.filter((text) => /hydrate|410/i.test(text))).toEqual([]);
});

test('телефон: над заметкой остаётся последняя папка с «…», а не три обрезанных части', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await page.request.post('/api/notes/create', { data: { title: 'Deep note', category: 'Audit A/Audit B', tags: [], content: 'Text.' } });
  expect(created.ok()).toBeTruthy();
  await page.goto('/notes/Audit%20A/Audit%20B/Deep%20note.md');
  const header = page.locator('header').first();
  await expect(header.getByText('Audit B', { exact: true })).toBeVisible();
  await expect(header.getByText('Audit A', { exact: true })).toBeHidden();
  await expect(header.getByText('…', { exact: false }).first()).toBeVisible();
});
