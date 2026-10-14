import { expect, test } from '@playwright/test';
import { createBlankNote, fillEditor, prepareMonos, uniqueTitle } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

async function fileContent(page, notePath) {
  const response = await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`);
  return response.ok() ? (await response.json()).content : '';
}

test('теги чипами: Enter добавляет, кнопка убирает, файл сохраняется', async ({ page }) => {
  const title = uniqueTitle('Chip Tags Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  const props = page.getByTestId('note-properties');
  await props.getByTestId('property-tags').fill('alpha');
  await props.getByTestId('property-tags').press('Enter');

  await expect(props.getByText('#alpha')).toBeVisible();
  await expect.poll(() => fileContent(page, notePath)).toMatch(/alpha/);

  await props.getByRole('button', { name: 'Remove tag alpha' }).click();
  await expect(props.getByText('#alpha')).toHaveCount(0);
  await expect.poll(() => fileContent(page, notePath)).not.toContain('alpha');
});

test('срок: дата в привычной записи сохраняется, неверная не трогает файл, очистка убирает срок', async ({ page }) => {
  const title = uniqueTitle('Due Input Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  const due = page.getByTestId('property-due');
  await due.fill('24.12.2026');
  await due.press('Enter');
  await expect.poll(() => fileContent(page, notePath)).toMatch(/due: "?2026-12-24"?/);

  await due.fill('31.02.2026');
  await due.press('Enter');
  await expect(page.getByRole('alert')).toContainText(/not a date/i);
  await expect.poll(() => fileContent(page, notePath)).toMatch(/due: "?2026-12-24"?/);

  await page.getByTestId('clear-due').click();
  await expect.poll(() => fileContent(page, notePath)).not.toMatch(/due: "?2026-12-24"?/);
});

test('футер: «More actions» открывает фокус, режим Markdown и цвет подписанными пунктами', async ({ page }) => {
  const title = uniqueTitle('Footer Menu Note');

  await createBlankNote(page, title);
  await page.getByRole('button', { name: 'More actions' }).click();

  await expect(page.getByRole('menuitem', { name: 'Focus mode' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Markdown source' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Note color' })).toBeVisible();

  await page.getByRole('menuitem', { name: 'Markdown source' }).click();
  await expect(page.getByTestId('raw-source')).toBeVisible();
});

test('оглавление свёрнуто, пока в заметке нет заголовков, и открывается при появлении', async ({ page }) => {
  const title = uniqueTitle('Outline Note');

  await createBlankNote(page, title);
  await fillEditor(page, 'Just a paragraph.');
  await expect(page.getByRole('button', { name: 'Show outline' })).toBeVisible();

  await fillEditor(page, '# Real heading\n\nText under it.');
  await expect(page.getByRole('button', { name: 'Hide outline' })).toBeVisible();
});

test('панель инструментов: «More tools» открывает таблицу, зачёркивание и настройки вида', async ({ page }) => {
  const title = uniqueTitle('Toolbar More Note');

  await createBlankNote(page, title);
  await page.getByRole('button', { name: 'More tools' }).click();

  await expect(page.getByRole('menuitem', { name: /strikethrough/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /insert table/i })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /content width/i })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: /insert table/i })).toHaveCount(0);
});

test('на телефоне свойства свёрнуты и открываются кнопкой', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const title = uniqueTitle('Phone Props Note');

  await createBlankNote(page, title);
  await expect(page.getByTestId('note-properties')).toHaveCount(0);

  await page.getByTestId('properties-toggle').click();
  await expect(page.getByTestId('note-properties')).toBeVisible();
});
