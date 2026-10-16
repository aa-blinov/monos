/**
 * E2E для Tier 1 UX-фич:
 *   - Word count + reading time в status bar редактора
 *   - Outline panel с auto-генерацией из заголовков
 *   - Quick switcher (Cmd+O) с inline-фильтрами tag: и path:
 *
 * Запускать: npm run test:scale (через playwright.config.js) или
 * напрямую: npx playwright test e2e/11-ux-features.spec.js
 */
import { test, expect } from '@playwright/test';
import {
  createBlankNote,
  editorBody,
  fillEditor,
  openBoardCard,
  prepareMonos,
  uniqueTitle,
  waitForSavedContent,
} from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

test('word count + reading time отображаются в status bar', async ({ page }) => {
  const title = uniqueTitle('Word Count Note');
  await createBlankNote(page, title);
  // 200 слов → reading time считается по фактическому содержимому (включая
  // любые префиксные элементы). Проверяем что формат "X words · Y min read" появился.
  const longText = Array(200).fill('word').join(' ');
  await fillEditor(page, longText);
  // status bar находится в EditorHeader — ищем в toolbar
  const statusBar = page.locator('span.tabular-nums').first();
  await expect(statusBar).toBeVisible({ timeout: 5_000 });
  await expect(statusBar).toHaveText(/\d+ words? · \d+ min read/);
});

test('outline panel появляется в редакторе с заголовками', async ({ page }) => {
  const title = uniqueTitle('Outline Note');
  await createBlankNote(page, title);
  await fillEditor(page, '# First Heading\n\nSome text\n\n## Subheading A\n\nMore text\n\n## Subheading B\n\nFinal text');
  // editedContent обновляется через onUpdate — даём ему время
  await page.waitForTimeout(500);
  const panel = page.getByTestId('outline-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('First Heading')).toBeVisible({ timeout: 3_000 });
  await expect(panel.getByText('Subheading A')).toBeVisible();
  await expect(panel.getByText('Subheading B')).toBeVisible();
});

test('outline panel показывает empty state если нет заголовков', async ({ page }) => {
  const title = uniqueTitle('Empty Outline Note');
  await createBlankNote(page, title);
  await fillEditor(page, 'Just a plain paragraph without any headings.');
  await page.waitForTimeout(500);
  // Без заголовков оглавление свёрнуто; по кнопке оно открывается с подсказкой.
  await page.getByRole('button', { name: 'Show outline' }).click();
  const panel = page.getByTestId('outline-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/no headings/i)).toBeVisible({ timeout: 3_000 });
});

// Заголовок далеко внизу: минимальная прокрутка уводит его к низу экрана, а
// клик по оглавлению должен выровнять его по верхнему краю редактора.
test('клик по оглавлению ставит курсор в заголовок и выравнивает его по верху', async ({ page }) => {
  const title = uniqueTitle('Long Outline Note');
  const paragraph = 'Paragraph text that makes this note long enough to scroll inside the editor. '.repeat(12);
  const sections = Array.from({ length: 12 }, (_, index) => `## Section ${index + 1}\n\n${paragraph}\n`).join('\n');
  const path = `notes/${title}.md`;
  await page.request.post(`/api/file?path=${encodeURIComponent(path)}&create=1`, {
    data: { content: `---\ntitle: "${title}"\n---\n\n# ${title}\n\n${sections}` },
  });
  await openBoardCard(page, title, path);

  await page.getByTestId('outline-panel').getByText('Section 6', { exact: true }).click();

  await expect.poll(async () => page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    let scroller = pm;
    while (scroller && !(['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) {
      scroller = scroller.parentElement;
    }
    const heading = [...pm.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Section 6');
    return Math.round(heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  }), { timeout: 5_000 }).toBeLessThanOrEqual(2);

  const caretAtHeadingStart = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('.ProseMirror h2')].find((h) => h.textContent.trim() === 'Section 6');
    const selection = window.getSelection();
    const firstText = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT).nextNode();
    return (selection.anchorNode === firstText || selection.anchorNode === heading) && selection.anchorOffset === 0;
  });
  expect(caretAtHeadingStart).toBe(true);
});

test('quick switcher (Cmd+O) открывается и фильтрует заметки', async ({ page }) => {
  // создаём несколько заметок с разными именами
  const titles = [
    uniqueTitle('Project Brief'),
    uniqueTitle('Daily Note'),
    uniqueTitle('Meeting Notes'),
  ];
  for (const t of titles) {
    await createBlankNote(page, t);
    await fillEditor(page, 'body');
    await page.goBack(); // back to dashboard
  }

  // Cmd+O
  await page.keyboard.press('Meta+O');
  // CommandPalette показывает "Quick switcher" / "Command palette" в header
  const header = page.locator('text=/quick switcher|command palette/i').first();
  await expect(header).toBeVisible({ timeout: 5_000 });

  // вводим "project" → должна быть видна "Project Brief"
  await page.keyboard.type('project');
  await expect(page.getByText('Project Brief', { exact: false }).first()).toBeVisible({ timeout: 3_000 });
});

test('quick switcher поддерживает inline-фильтр path:', async ({ page }) => {
  // создаём заметки через UI
  const noteA = uniqueTitle('Note A');
  const noteB = uniqueTitle('Note B');
  await createBlankNote(page, noteA);
  await page.goBack();
  await createBlankNote(page, noteB);
  await page.goBack();

  // click on body чтобы убрать фокус из input
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  // open quick switcher; Recent loads on open, and the filter must still apply
  // when the user types after that load (this order used to leave Recent unfiltered)
  const recentLoaded = page.waitForResponse((response) => response.url().includes('/api/notes/recent'));
  await page.keyboard.press('Meta+O');
  await recentLoaded;
  const header = page.locator('text=/quick switcher|command palette/i').first();
  await expect(header).toBeVisible({ timeout: 5_000 });
  // Keys typed before the field has focus go to the page and are lost, so wait for focus.
  await expect(page.locator('div.fixed.inset-0.z-\\[300\\] input').first()).toBeFocused();

  // вводим "path:NONEXISTENT_XYZ" → палитра не должна показать наши заметки
  // (path-фильтр применяется через rankQuickSwitcherResults, тест проверяет,
  // что фильтр реально работает в UI)
  await page.keyboard.type('path:NONEXISTENT_XYZ');
  await page.waitForTimeout(300);
  const palette = page.locator('div.fixed.inset-0.z-\\[300\\]');
  const paletteText = await palette.innerText();
  // наши созданные заметки не должны появиться
  expect(paletteText).not.toContain(noteA);
  expect(paletteText).not.toContain(noteB);
});
