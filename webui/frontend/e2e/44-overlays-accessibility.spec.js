import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// Dialogs and the command palette are the places a keyboard or a screen reader goes through one control at a
// time: the dialog has a name, Tab does not leave it, Esc closes it, and focus goes back to where it was.
test('окно «Новая заметка»: имя, Tab не уходит наружу, Esc закрывает, фокус возвращается', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  const opener = page.locator('main').getByRole('button', { name: /^(\+\s*)?New note$/i }).first();
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(/note/i);

  // Tab around the dialog twice: focus never reaches the page behind it.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(inside, `Tab ${i + 1} остался в окне`).toBe(true);
  }
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('палитра команд: активная строка в aria-activedescendant, Tab не ходит по строкам, Esc закрывает с результата', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('dialog').getByRole('combobox');
  await expect(input).toBeFocused();

  const options = page.getByRole('dialog').getByRole('option');
  expect(await options.count()).toBeGreaterThan(2);
  await expect(input).toHaveAttribute('aria-activedescendant', 'command-palette-option-0');
  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'command-palette-option-1');
  await expect(page.locator('#command-palette-option-1')).toHaveAttribute('aria-selected', 'true');

  // The rows are not Tab stops: one Tab leaves the list, it does not walk through every row.
  const tabbable = await options.evaluateAll((rows) => rows.filter((row) => row.tabIndex >= 0).length);
  expect(tabbable).toBe(0);

  // Esc works wherever focus is in the palette, also on a result.
  await page.locator('#command-palette-option-1').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// The page has an outline a screen reader can jump through: one h1, a labelled navigation, a way past the
// sidebar, and controls that say which state they are in.
test('доска: h1, навигация с именем, ссылка «Skip to content», у поиска есть имя', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Sidebar' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: /search/i }).first()).toBeVisible();

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('заметка: название заметки это h1; настройки: режим темы сообщает выбранное', async ({ page }) => {
  await prepareMonos(page);
  const title = `Heading ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toHaveCount(1);

  await page.goto('/settings');
  const group = page.getByRole('group', { name: /theme mode|mode/i }).first();
  await expect(group).toBeVisible();
  await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
});

// Controls are at least 24px tall (WCAG 2.5.8), and the touch ones on a phone as tall as a finger needs.
test('настройки: подписи галочек и кнопки действий не ниже 24px, на телефоне не ниже 44px', async ({ page }) => {
  await prepareMonos(page);
  for (const [width, minimum] of [[1280, 24], [390, 44]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/settings');
    const heights = await page.evaluate(() => {
      const pick = [...document.querySelectorAll('label:has(input[type=checkbox])')];
      return pick.map((el) => Math.round(el.getBoundingClientRect().height));
    });
    expect(heights.length).toBeGreaterThan(1);
    for (const height of heights) expect(height, `${width}px подпись галочки`).toBeGreaterThanOrEqual(minimum);
  }
});

test('редактор на телефоне: кнопки панели форматирования не меньше 40px', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 390, height: 800 });
  const title = `Toolbar ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  await expect(page.getByRole('toolbar').first()).toBeVisible();
  await expect(page.locator('[role=toolbar] button').nth(9)).toBeVisible();
  const sizes = await page.locator('[role=toolbar] button').evaluateAll((buttons) => buttons.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  expect(sizes.length).toBeGreaterThan(8);
  for (const [w, h] of sizes) { expect(w).toBeGreaterThanOrEqual(40); expect(h).toBeGreaterThanOrEqual(40); }
});

test('при «меньше движения» карточка не приподнимается, а поле прокручивается без анимации', async ({ page }) => {
  await prepareMonos(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const title = `Still ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'text' } });
  await page.goto('/');
  const card = page.locator('main [role=list]').getByText(title).first();
  await card.hover();
  await page.waitForTimeout(300);
  const transform = await page.locator('main [role=list] > *', { hasText: title }).first().evaluate((el) => getComputedStyle(el).transform);
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
});

test('цвет страницы: theme-color следует за темой, списки <select> берут режим приложения', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  const state = await page.evaluate(() => ({ meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'), bg: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim(), dark: document.documentElement.classList.contains('dark'), selectScheme: getComputedStyle(document.querySelector('select')).colorScheme, pageScheme: getComputedStyle(document.documentElement).colorScheme }));
  expect(state.meta?.toLowerCase()).toBe(state.bg.toLowerCase());
  expect(state.selectScheme).toBe(state.dark ? 'dark' : 'light');
  // Not on the whole page: it slowed rendering and broke caret placement in the editor.
  expect(state.pageScheme).toBe('normal');
});

// The brackets of a wiki link are Markdown, not words: a reader sees the name alone, the caret brings them back.
test('ссылка на заметку: скобки [[ ]] скрыты, пока курсор не в ссылке', async ({ page }) => {
  await prepareMonos(page);
  const title = `Bracket ${Date.now()}`;
  await page.request.post('/api/notes/create', { data: { title, category: 'Board', tags: [], content: 'Смотри [[Целевая заметка]] и [[Целевая заметка|вот это]] дальше.' } });
  await page.goto('/');
  await page.locator('main [role=list]').getByText(title).first().click();
  // Decorations of one link are spans of their own: the name, and the hidden pieces beside it.
  const names = page.locator('.ProseMirror .wiki-link:not(.wiki-link-bracket)');
  await expect(names.first()).toBeVisible();
  const hidden = page.locator('.ProseMirror .wiki-link-bracket');
  await expect(hidden.first()).toBeAttached();
  const before = await hidden.count();
  expect(before).toBeGreaterThanOrEqual(4);
  expect(await hidden.evaluateAll((els) => els.every((el) => getComputedStyle(el).fontSize === '0px'))).toBe(true);
  // The file itself is unchanged: the text still contains the brackets.
  expect(await page.locator('.ProseMirror').innerText()).toContain('[[');
  // Caret inside the first link brings its brackets back; the other link stays tidy.
  await names.first().click();
  await expect(hidden).toHaveCount(before - 2);
});

// A disclosure line looks like one: it keeps the browser's marker, so a person sees there is more behind it.
test('настройки: свёрнутые блоки «Дополнительно» и подсказка про токен показывают маркер раскрытия', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/settings');
  for (const selector of ['[data-testid="git-advanced"] > summary', '[data-testid="commit-advanced"] > summary']) {
    const summary = page.locator(selector);
    await expect(summary).toBeAttached();
    expect(await summary.evaluate((el) => getComputedStyle(el).display)).toBe('list-item');
  }
});
