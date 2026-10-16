import { expect, test } from '@playwright/test';
import { createBlankNote, prepareMonos, uniqueTitle } from './support/monos.js';

// Where the slash is and where the menu stands, in viewport pixels.
async function slashGeometry(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('[role="listbox"]');
    const option = document.querySelector('[role="option"]');
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const slash = document.createRange();
    slash.setStart(range.startContainer, range.startOffset - 1);
    slash.setEnd(range.startContainer, range.startOffset);
    const text = document.createRange();
    text.selectNodeContents(option);
    const box = menu.getBoundingClientRect();
    const slashBox = slash.getBoundingClientRect();
    return {
      menu: { left: box.left, top: box.top, bottom: box.bottom },
      slash: { left: slashBox.left, top: slashBox.top, bottom: slashBox.bottom },
      optionLeft: option.getBoundingClientRect().left,
      optionTextLeft: text.getBoundingClientRect().left,
      optionTextAlign: getComputedStyle(option).textAlign,
    };
  });
}

// The menu touches the slash's line on one side: just above it, or just below it.
function isBesideSlash(geometry) {
  const above = geometry.slash.top - geometry.menu.bottom;
  const below = geometry.menu.top - geometry.slash.bottom;
  return (above >= 0 && above <= 14) || (below >= 0 && below <= 14);
}

test('меню команд встаёт под знаком «/», пункты выровнены слева, стрелки и Tab выбирают', async ({ page }) => {
  await prepareMonos(page);
  await createBlankNote(page, uniqueTitle('Slash Below'));
  await page.locator('.ProseMirror').first().click();
  await page.keyboard.type('/');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  const geometry = await slashGeometry(page);
  expect(Math.abs(geometry.menu.left - geometry.slash.left)).toBeLessThanOrEqual(2);
  // There is room below the first line, so the menu opens under the slash.
  expect(geometry.menu.top - geometry.slash.bottom).toBeGreaterThanOrEqual(0);
  expect(geometry.menu.top - geometry.slash.bottom).toBeLessThanOrEqual(14);
  // Items start at the left padding of the menu, not in the middle of the row.
  expect(geometry.optionTextAlign).toBe('left');
  expect(geometry.optionTextLeft - geometry.optionLeft).toBeGreaterThanOrEqual(10);
  expect(geometry.optionTextLeft - geometry.optionLeft).toBeLessThanOrEqual(14);

  const selected = () => page.locator('[role="option"][aria-selected="true"]');
  await expect(selected()).toHaveAccessibleName('Heading 1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(selected()).toHaveAccessibleName('Bullet list');
  await page.keyboard.press('ArrowUp');
  await expect(selected()).toHaveAccessibleName('Heading 2');

  await page.keyboard.press('ArrowUp');
  await expect(selected()).toHaveAccessibleName('Heading 1');
  // Up from the first item wraps to the last one, and down from the last wraps back.
  await page.keyboard.press('ArrowUp');
  await expect(selected()).toHaveAccessibleName('Divider');
  await page.keyboard.press('ArrowDown');
  await expect(selected()).toHaveAccessibleName('Heading 1');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(listbox).toHaveCount(0);
  await expect(page.locator('.ProseMirror ul > li')).toHaveCount(1);
  await expect(page.locator('.ProseMirror')).not.toContainText('/');
});

test('у нижнего края меню открывается над строкой, Escape закрывает, Enter выбирает', async ({ page }) => {
  await prepareMonos(page);
  await createBlankNote(page, uniqueTitle('Slash Above'));
  await page.locator('.ProseMirror').first().click();
  for (let line = 0; line < 14; line += 1) {
    await page.keyboard.type(`Строка ${line + 1}`);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.type('/');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  // Too little room below the slash: the menu sits above it, touching the line.
  const geometry = await slashGeometry(page);
  expect(geometry.slash.top - geometry.menu.bottom).toBeGreaterThanOrEqual(0);
  expect(geometry.slash.top - geometry.menu.bottom).toBeLessThanOrEqual(14);
  expect(Math.abs(geometry.menu.left - geometry.slash.left)).toBeLessThanOrEqual(2);

  await page.keyboard.press('Escape');
  await expect(listbox).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toContainText('Строка 14');

  await page.keyboard.type('/');
  await expect(listbox).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveAccessibleName('Divider');
  await page.keyboard.press('Enter');
  await expect(listbox).toHaveCount(0);
  await expect(page.locator('.ProseMirror hr')).toHaveCount(1);
});

test('меню следует за знаком, когда текст прокручивается под ним', async ({ page }) => {
  // A taller window leaves room beside a caret in the middle of a long text.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await prepareMonos(page);
  await createBlankNote(page, uniqueTitle('Slash Scroll'));
  await page.locator('.ProseMirror').first().click();
  for (let line = 0; line < 30; line += 1) {
    await page.keyboard.type(`Строка ${line + 1}`);
    await page.keyboard.press('Enter');
  }
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('ArrowUp');
  }
  await page.keyboard.type('/');
  await expect(page.getByRole('listbox')).toBeVisible();

  const first = await slashGeometry(page);
  expect(isBesideSlash(first)).toBe(true);

  // The wheel scrolls the text back up, which moves the slash down; the menu moves with it.
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, -40);
  await expect.poll(async () => (await slashGeometry(page)).slash.top - first.slash.top).toBeGreaterThanOrEqual(20);
  expect(isBesideSlash(await slashGeometry(page))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});
