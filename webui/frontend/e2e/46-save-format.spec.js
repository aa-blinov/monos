import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

// What saving does to a note's text. The rich editor writes Markdown from its own model, so it tidies the markup
// (and cannot keep raw HTML, which it would turn into `&lt;div&gt;`): a note with HTML therefore opens as source,
// where nothing is rewritten. The source mode keeps the text as written.
async function make(page, title, body) {
  const front = `---\ntitle: ${title}\n---\n`;
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: '' } })).json();
  await page.request.post(`/api/file?path=${encodeURIComponent(created.path)}`, { data: { content: front + body }, headers: { 'Content-Type': 'application/json' } });
  return created.path;
}
const read = async (page, notePath) => (await (await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`)).json()).content;

test.beforeEach(async ({ page }) => { await prepareMonos(page); });

test('заметка с HTML открывается как исходный текст и сохраняется без изменений тегов', async ({ page }) => {
  const title = uniqueTitle('Html Note');
  const body = 'Intro\n\n<div class="box">raw html</div>\n\n<!-- a comment -->\n\nline   \nend\n';
  const notePath = await make(page, title, body);
  await openNote(page, title);
  await expect(page.getByTestId('raw-html-notice')).toBeVisible();
  const area = page.getByTestId('raw-source');
  await expect(area).toBeVisible();
  await expect(area).toHaveValue(new RegExp('<div class="box">raw html</div>'));
  await area.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
  await page.keyboard.type('more');
  await page.keyboard.press('ControlOrMeta+s');
  await waitForSavedContent(page, notePath, 'more');
  const saved = await read(page, notePath);
  expect(saved).toContain('<div class="box">raw html</div>');
  expect(saved).toContain('<!-- a comment -->');
  expect(saved).toContain('line   \nend');
  expect(saved).not.toContain('&lt;');
});

test('следующая заметка без HTML снова открывается в обычном редакторе', async ({ page }) => {
  const htmlTitle = uniqueTitle('Html First');
  const plainTitle = uniqueTitle('Plain Second');
  await make(page, htmlTitle, '<span>x</span>\n');
  await make(page, plainTitle, 'just words\n');
  await openNote(page, htmlTitle);
  await expect(page.getByTestId('raw-source')).toBeVisible();
  await openNote(page, plainTitle);
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await expect(page.getByTestId('raw-source')).toHaveCount(0);
  await expect(page.getByTestId('raw-html-notice')).toHaveCount(0);
});

// Behaviour changed on purpose (QA J6): a block nobody touched is written back as it was read; only the block
// the person edited goes through the serializer. The note is not tidied behind the person's back.
test('обычный режим при сохранении не переписывает нетронутые блоки', async ({ page }) => {
  const title = uniqueTitle('Tidy Note');
  const body = 'Setext\n======\n\n* star\n* two\n\n__bold__ and _it_\n\n1) one\n2) two\n\n***\n';
  const notePath = await make(page, title, body);
  await openNote(page, title);
  await expect(page.locator('.ProseMirror')).toBeVisible();
  // The caret goes where the test says, not where a click at the bottom happens to land.
  await page.locator('.ProseMirror ol li').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('QQ');
  await waitForSavedContent(page, notePath, 'QQ');
  const saved = await read(page, notePath);
  expect(saved).toContain('Setext\n======\n\n* star\n* two\n\n__bold__ and _it_\n\n1) one\n2) twoQQ\n\n***');
});

test('режим «Исходный Markdown» сохраняет текст как написан', async ({ page }) => {
  const title = uniqueTitle('Source Note');
  const body = 'Setext\n======\n\n* star   \n\n\n\nafter\n';
  const notePath = await make(page, title, body);
  await openNote(page, title);
  await page.getByTestId('editor-more').click();
  await page.getByTestId('toggle-raw-mode').click();
  const area = page.getByTestId('raw-source');
  await area.evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
  await page.keyboard.type('QQ');
  await page.keyboard.press('ControlOrMeta+s');
  await waitForSavedContent(page, notePath, 'QQ');
  const saved = await read(page, notePath);
  expect(saved).toContain('Setext\n======');
  expect(saved).toContain('* star   \n\n\n\nafter');
  await expect(page.getByTestId('raw-html-notice')).toHaveCount(0);
});
