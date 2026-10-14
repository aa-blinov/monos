import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { createBlankNote, editorBody, fillEditor, openBoardCard, prepareMonos, uniqueTitle } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

async function fileContent(page, notePath) {
  const response = await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`);
  return response.ok() ? (await response.json()).content : '';
}

test('теги в окошке: Enter добавляет, кнопка убирает, файл сохраняется', async ({ page }) => {
  const title = uniqueTitle('Chip Tags Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await page.getByTestId('property-tags-button').click();
  const panel = page.getByTestId('property-panel');
  await panel.getByTestId('property-tags').fill('alpha');
  await panel.getByTestId('property-tags').press('Enter');

  await expect(panel.getByText('#alpha')).toBeVisible();
  await expect.poll(() => fileContent(page, notePath)).toMatch(/alpha/);

  await panel.getByRole('button', { name: 'Remove tag alpha' }).click();
  await expect(panel.getByText('#alpha')).toHaveCount(0);
  await expect.poll(() => fileContent(page, notePath)).not.toContain('alpha');
});

test('черновик тега принимается, когда окошко закрывают кликом по тексту', async ({ page }) => {
  const title = uniqueTitle('Tag Draft Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await page.getByTestId('property-tags-button').click();
  await page.getByTestId('property-tags').fill('draftone');
  await page.getByTestId('rich-editor-input').click();

  await expect(page.getByTestId('property-panel')).toHaveCount(0);
  await expect.poll(() => fileContent(page, notePath)).toMatch(/draftone/);
});

test('срок в окошке: дата в привычной записи сохраняется, неверная не трогает файл, очистка убирает срок', async ({ page }) => {
  const title = uniqueTitle('Due Input Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await page.getByTestId('property-due-button').click();
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

test('нижняя панель: «More actions» открывает фокус и режим Markdown подписанными пунктами', async ({ page }) => {
  const title = uniqueTitle('Footer Menu Note');

  await createBlankNote(page, title);
  await page.getByRole('button', { name: 'More actions' }).click();

  await expect(page.getByRole('menuitem', { name: 'Focus mode' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Markdown source' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Note color' })).toBeVisible();

  await page.getByRole('menuitem', { name: 'Markdown source' }).click();
  await expect(page.getByTestId('raw-source')).toBeVisible();
});

test('цвет заметки открывается окошком над нижней панелью и закрывается по Escape', async ({ page }) => {
  const title = uniqueTitle('Color Popover Note');

  await createBlankNote(page, title);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Note color' }).click();

  const panel = page.getByTestId('property-panel');
  await expect(panel).toHaveAttribute('data-panel', 'color');
  await expect(page.getByRole('button', { name: 'No', exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('связанные заметки открываются окошком по кнопке «Related» и ведут к открытию', async ({ page }) => {
  const target = uniqueTitle('Linked Target');
  const source = uniqueTitle('Linking Source');
  const targetPath = `notes/${target}.md`;

  await page.request.post(`/api/file?path=${encodeURIComponent(targetPath)}`, {
    data: { content: `---\ntitle: "${target}"\n---\n\nTarget body` },
  });
  await page.request.post(`/api/file?path=${encodeURIComponent(`notes/${source}.md`)}`, {
    data: { content: `---\ntitle: "${source}"\n---\n\nSee [[${target}]]` },
  });
  await openBoardCard(page, target, targetPath);

  await page.getByTestId('property-related-button').click();
  const panel = page.getByTestId('property-panel');
  await expect(panel).toHaveAttribute('data-panel', 'related');
  await panel.getByRole('button', { name: new RegExp(source) }).click();

  await expect(page.getByTestId('property-panel')).toHaveCount(0);
  await expect(editorBody(page)).toContainText('See');
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

test('на телефоне свойства остаются в нижней панели, окошко не выходит за экран', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const title = uniqueTitle('Phone Props Note');

  await createBlankNote(page, title);
  await expect(page.getByTestId('note-properties')).toBeVisible();
  await expect(page.getByTestId('property-panel')).toHaveCount(0);

  await page.getByTestId('property-tags-button').click();
  await expect(page.getByTestId('property-tags')).toBeVisible();
  const box = await page.getByTestId('property-panel').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('экспорт: окошко отдаёт Markdown и HTML файлами с именем заметки', async ({ page }) => {
  const title = uniqueTitle('Export Note');

  await createBlankNote(page, title);
  await fillEditor(page, 'Export body text.');
  await page.getByTestId('export-button').click();
  await expect(page.getByTestId('property-panel')).toHaveAttribute('data-panel', 'export');

  const markdownDownload = page.waitForEvent('download');
  await page.getByTestId('export-md').click();
  const markdown = await markdownDownload;
  expect(markdown.suggestedFilename()).toBe(`${title}.md`);
  expect(fs.readFileSync(await markdown.path(), 'utf8')).toContain('Export body text.');
  await expect(page.getByTestId('property-panel')).toHaveCount(0);

  await page.getByTestId('export-button').click();
  const htmlDownload = page.waitForEvent('download');
  await page.getByTestId('export-html').click();
  const html = await htmlDownload;
  expect(html.suggestedFilename()).toBe(`${title}.html`);
  expect(fs.readFileSync(await html.path(), 'utf8')).toContain('Export body text.');
});

test('экспорт в PDF в браузере говорит, что нужно настольное приложение', async ({ page }) => {
  const title = uniqueTitle('Export Pdf Note');

  await createBlankNote(page, title);
  await page.getByTestId('export-button').click();
  await page.getByTestId('export-pdf').click();
  await expect(page.getByRole('alert')).toContainText('desktop app');
});
