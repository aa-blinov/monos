import { expect, test } from '@playwright/test';
import { createBlankNote, editorBody, fillEditor, prepareMonos, uniqueTitle } from './support/monos.js';

test.beforeEach(async ({ page }) => {
  await prepareMonos(page);
});

async function fileContent(page, notePath) {
  const response = await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`);
  return response.ok() ? (await response.json()).content : '';
}

test('после правки видно, что заметка сохранена', async ({ page }) => {
  const title = uniqueTitle('Save State Note');

  await createBlankNote(page, title);
  await fillEditor(page, 'Text that gets saved.');

  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 8000 });
});

test('ошибка сохранения видна, а текст остаётся в редакторе', async ({ page }) => {
  const title = uniqueTitle('Failed Save Note');

  await createBlankNote(page, title);
  await page.route('**/api/file?*', (route) => (route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"disk full"}' })
    : route.continue()));
  await fillEditor(page, 'Text that must survive the failure.');

  await expect(page.getByRole('status').filter({ hasText: /save failed/i })).toBeVisible({ timeout: 8000 });
  await expect(editorBody(page)).toContainText('Text that must survive the failure.');

  await page.unroute('**/api/file?*');
  await fillEditor(page, 'Text that must survive the failure. Saved after retry.');
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 8000 });
});

test('правка тела не стирает шапку заметки', async ({ page }) => {
  const title = uniqueTitle('Frontmatter Guard');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await fillEditor(page, 'Body text kept under the metadata.');

  await expect.poll(() => fileContent(page, notePath)).toContain('Body text kept under the metadata.');
  const content = await fileContent(page, notePath);
  expect(content.startsWith('---\n')).toBe(true);
  expect(content.match(/^title: /gm)).toHaveLength(1);
});

test('занятое название не перезаписывает существующую заметку', async ({ page }) => {
  const title = uniqueTitle('Duplicate Guard');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await fillEditor(page, 'Original text that must stay.');
  await expect.poll(() => fileContent(page, notePath)).toContain('Original text that must stay.');

  await page.goto('/');
  await page.locator('main').getByRole('button', { name: /^\+\s*New note$/i }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: /^Create$/ }).click();

  await expect(page.getByRole('alert')).toContainText(/already exists/i);
  expect(await fileContent(page, notePath)).toContain('Original text that must stay.');
});

test('очистка поля поиска возвращает доску', async ({ page }) => {
  const title = uniqueTitle('Search Reset Note');

  await createBlankNote(page, title);
  await page.goto('/');

  const card = page.locator('main').getByRole('button', { name: new RegExp(`^${title}\\b`) }).first();
  const search = page.getByPlaceholder('Search', { exact: true });
  await expect(card).toBeVisible();

  await search.fill('zzqxwvnotfound');
  await expect(card).toHaveCount(0);

  await search.fill('');
  await expect(card).toBeVisible();
});

test('удаление тега из всех заметок требует подтверждения', async ({ page }) => {
  const tag = `probe${Date.now().toString(36)}`;
  const title = uniqueTitle('Tag Probe Note');
  const notePath = `notes/${title}.md`;

  await page.request.post(`/api/file?path=${encodeURIComponent(notePath)}`, {
    data: { content: `---\ntitle: ${title}\ntags: [${tag}]\n---\n\nBody.\n` },
  });
  await expect.poll(async () => (await page.request.get('/api/tags')).text()).toContain(tag);

  await page.goto('/');
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await page.locator('[data-testid="open-tags"]:visible').first().click();

  const row = page.locator('ul li').filter({ has: page.getByTestId('tag-delete') }).filter({ hasText: tag });
  await row.getByTestId('tag-delete').click();

  await expect(page.getByText(new RegExp(`Remove #${tag} from 1 note`))).toBeVisible();
  await page.getByRole('button', { name: 'Remove tag', exact: true }).click();

  await expect.poll(async () => (await page.request.get('/api/tags')).text()).not.toContain(tag);
  expect(await fileContent(page, notePath)).not.toContain(tag);
});

test('строка с разметкой, вставленная одним куском, сохраняется как разметка', async ({ page }) => {
  const title = uniqueTitle('Markdown Burst Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await editorBody(page).click();
  await page.keyboard.insertText('# Heading one');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('**bold** text');

  await expect.poll(() => fileContent(page, notePath)).toContain('**bold** text');
  const content = await fileContent(page, notePath);
  expect(content).toMatch(/^# Heading one$/m);
  expect(content).not.toContain('\\#');
  expect(content).not.toContain('\\*\\*');
});

test('Enter после заголовка начинает обычный абзац', async ({ page }) => {
  const title = uniqueTitle('Heading Enter Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await editorBody(page).click();
  await page.keyboard.type('# Title');
  await page.keyboard.press('Enter');
  await page.keyboard.type('plain line');

  await expect.poll(() => fileContent(page, notePath)).toContain('plain line');
  const content = await fileContent(page, notePath);
  expect(content).toMatch(/^# Title$/m);
  expect(content).not.toMatch(/^#+ plain line/m);
});

test('Enter на папке в дереве раскрывает её ровно один раз', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open sidebar' });
  if (await toggle.isVisible()) await toggle.click();

  const folderRow = page.locator('button[aria-expanded]').filter({ hasText: 'Work' }).first();
  await expect(folderRow).toBeVisible();
  const before = await folderRow.getAttribute('aria-expanded');
  await folderRow.focus();
  await page.keyboard.press('Enter');
  await expect(folderRow).toHaveAttribute('aria-expanded', before === 'true' ? 'false' : 'true');
  await page.keyboard.press('Enter');
  await expect(folderRow).toHaveAttribute('aria-expanded', before);
});

test('палитра команд предлагает новую заметку и корзину, Escape её закрывает', async ({ page }) => {
  await prepareMonos(page);
  await page.goto('/');
  await page.keyboard.press('Control+k');

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('option', { name: /New note/i })).toBeVisible();
  await expect(page.getByRole('option', { name: /Open trash/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('поиск без результатов предлагает очистить запрос кнопкой', async ({ page }) => {
  await page.goto('/');
  const search = page.getByPlaceholder('Search', { exact: true });

  await search.fill('zzqxwvnotfound');
  await page.getByRole('button', { name: 'Clear search' }).click();

  await expect(search).toHaveValue('');
  await expect(page.locator('main').getByRole('button', { name: /^\+\s*New note$/i })).toBeVisible();
});

test('Enter после заголовка со ссылкой [[…]] начинает обычный абзац', async ({ page }) => {
  const title = uniqueTitle('Wiki Heading Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await editorBody(page).click();
  await page.keyboard.type('## See also [[Welcome]]');
  await page.keyboard.press('Enter');
  await page.keyboard.type('next line');

  await expect.poll(() => fileContent(page, notePath)).toContain('next line');
  const content = await fileContent(page, notePath);
  expect(content).toMatch(/^## See also \[\[Welcome\]\]$/m);
  expect(content).not.toMatch(/^#+ .*next line/m);
});

test('занятое название предлагает создать копию с номером', async ({ page }) => {
  const title = uniqueTitle('Numbered Copy Note');

  await createBlankNote(page, title);
  await fillEditor(page, 'Original text.');

  await page.goto('/');
  await page.locator('main').getByRole('button', { name: /^\+\s*New note$/i }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: /^Create$/ }).click();
  await expect(page.getByRole('alert')).toContainText(/already exists/i);

  await page.getByRole('button', { name: `Create as ${title} 2` }).click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(`${title} 2`);
});

test('занятое название предлагает открыть существующую заметку', async ({ page }) => {
  const title = uniqueTitle('Open Existing Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await fillEditor(page, 'Existing text.');
  await expect.poll(() => fileContent(page, notePath)).toContain('Existing text.');

  await page.goto('/');
  await page.locator('main').getByRole('button', { name: /^\+\s*New note$/i }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: /^Create$/ }).click();
  await expect(page.getByRole('alert')).toContainText(/already exists/i);

  await page.getByRole('button', { name: 'Open the existing note' }).click();
  await expect(page.locator('input[placeholder="Note Title"]')).toHaveValue(title);
  await expect(editorBody(page)).toContainText('Existing text.');
});

test('после сбоя сохранения кнопка «Retry» сохраняет текст снова', async ({ page }) => {
  const title = uniqueTitle('Retry Save Note');
  const notePath = `notes/${title}.md`;

  await createBlankNote(page, title);
  await page.route('**/api/file?*', (route) => (route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"disk full"}' })
    : route.continue()));
  await fillEditor(page, 'Retry text.');

  const retry = page.getByRole('status').getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toBeVisible({ timeout: 8000 });
  await page.unroute('**/api/file?*');
  await retry.click();

  await expect.poll(() => fileContent(page, notePath)).toContain('Retry text.');
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 8000 });
});

test('контекстное меню дерева открывается с клавиатуры и ходит стрелками', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open sidebar' });
  if (await toggle.isVisible()) await toggle.click();

  const folderRow = page.locator('button[aria-expanded]').filter({ hasText: 'Work' }).first();
  await expect(folderRow).toBeVisible();
  await folderRow.focus();
  await page.keyboard.press('Shift+F10');

  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});
