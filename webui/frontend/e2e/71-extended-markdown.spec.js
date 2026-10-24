import { expect, test } from '@playwright/test';
import { createBlankNote, openNote, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

// ==highlight==, H~2~O, x^2^ and footnotes are written in the file as such. The editor draws them (mark, sub, sup, a
// footnote label) and saves the same text back: an edit elsewhere in the note changes nothing in their markup.
const BODY = [
  'Water is H~2~O and ==highlighted words== and x^2^ here.',
  '',
  'A claim[^1] and prose that is no markup: a == b, ~5 minutes, 2^10 and 3^4, [^9] alone.',
  '',
  'Last paragraph.',
  '',
  '[^1]: The ==source== of the claim.',
  '',
].join('\n');

async function make(page, title, body) {
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: '' } })).json();
  await page.request.post(`/api/file?path=${encodeURIComponent(created.path)}`, {
    data: { content: `---\ntitle: ${title}\n---\n${body}` },
    headers: { 'Content-Type': 'application/json' },
  });
  return created.path;
}
const read = async (page, notePath) => String((await (await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`)).json()).content);

test.beforeEach(async ({ page }) => { await prepareMonos(page); });

test('the editor draws the highlight, the sub- and superscript and the footnotes', async ({ page }) => {
  const title = uniqueTitle('Extended');
  await make(page, title, BODY);
  await openNote(page, title);
  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();

  await expect(editor.locator('mark')).toHaveText(['highlighted words', 'source']);
  await expect(editor.locator('sub')).toHaveText('2');
  await expect(editor.locator('sup:not(.footnote-ref)')).toHaveText('2');
  await expect(editor.locator('sup.footnote-ref')).toHaveText('1');
  await expect(editor.locator('p.footnote-def')).toHaveText('The source of the claim.');
  await expect(editor.locator('p.footnote-def')).toHaveAttribute('data-footnote-def', '1');
  // Prose that only looks like markup stays text.
  await expect(editor).toContainText('a == b, ~5 minutes, 2^10 and 3^4, [^9] alone.');
  await expect(editor.locator('mark')).toHaveCount(2);
});

test('typing elsewhere and saving keeps the markup of the file', async ({ page }) => {
  const title = uniqueTitle('Extended Save');
  const notePath = await make(page, title, BODY);
  await openNote(page, title);
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('mark').first()).toBeVisible();

  await editor.getByText('Last paragraph.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' QQ');
  await waitForSavedContent(page, notePath, 'QQ');
  expect(await read(page, notePath)).toBe(`---\ntitle: ${title}\n---\n${BODY.replace('Last paragraph.', 'Last paragraph. QQ')}`);

  // Inside the highlight and the definition: the markers are written back where they were.
  await editor.locator('mark').first().click();
  await page.keyboard.type('Z');
  await editor.locator('p.footnote-def').click();
  await page.keyboard.press('End');
  await page.keyboard.type('Y');
  await waitForSavedContent(page, notePath, 'Y');
  const saved = await read(page, notePath);
  expect(saved).toMatch(/==[a-z ]*Z[a-z ]*==/);
  expect(saved.replace('Z', '')).toContain('==highlighted words==');
  expect(saved).toContain('H~2~O');
  expect(saved).toContain('x^2^');
  expect(saved).toContain('A claim[^1] and prose');
  expect(saved).toContain('[^1]: The ==source== of the claim.Y');
  expect(saved).not.toContain('\\[');
});

test('a mark is added from the toolbar and saved as Markdown', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const title = uniqueTitle('Extended Toolbar');
  const notePath = await make(page, title, 'mark this word\n');
  await openNote(page, title);
  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  for (let step = 0; step < 4; step += 1) await page.keyboard.press('Shift+ArrowLeft');
  await page.getByRole('button', { name: 'Highlight' }).click();
  await expect(editor.locator('mark')).toHaveText('word');
  await waitForSavedContent(page, notePath, '==word==');
});

test('the slash menu offers Heading 3 and Heading 4 and applies them', async ({ page }) => {
  await createBlankNote(page, uniqueTitle('Slash Levels'));
  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await page.keyboard.type('/');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole('option', { name: 'Heading 3' })).toBeVisible();
  await expect(listbox.getByRole('option', { name: 'Heading 4' })).toBeVisible();
  await listbox.getByRole('option', { name: 'Heading 3' }).click();
  // The caret returns to the text on the next tick of the page; a click on the new heading is where a person goes on.
  await editor.locator('h3').click();
  await page.keyboard.type('Third');
  await expect(editor.locator('h3')).toHaveText('Third');

  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await expect(listbox).toBeVisible();
  await listbox.getByRole('option', { name: 'Heading 4' }).click();
  await editor.locator('h4').click();
  await page.keyboard.type('Fourth');
  await expect(editor.locator('h4')).toHaveText('Fourth');
});
