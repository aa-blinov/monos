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
  // любые префиксные элементы). Проверяем что формат X words · Y min read появился.
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
  const panel = page.getByTestId('outline-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/no headings/i)).toBeVisible({ timeout: 3_000 });
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

  // open quick switcher
  await page.keyboard.press('Meta+O');
  const header = page.locator('text=/quick switcher|command palette/i').first();
  await expect(header).toBeVisible({ timeout: 5_000 });

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
