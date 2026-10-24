import { expect, test } from '@playwright/test';
import { openNote, prepareMonos, uniqueTitle, waitForSavedContent } from './support/monos.js';

// A note that ends with a rule, a fence, a table or a list, and the person types below it: the last block is kept
// byte for byte and the new paragraph is a block of its own, after a blank line (it was glued to the rule: `***QQ`).
const ENDINGS = {
  'rule ***': '***',
  'rule ---': '---',
  'code fence': '```js\nlet a = 1;\n```',
  table: '| a | b |\n| --- | --- |\n| 1 | 2 |',
  list: '- one\n- two',
  quote: '> quoted',
};

async function make(page, title, body) {
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: '', tags: [], content: '' } })).json();
  await page.request.post(`/api/file?path=${encodeURIComponent(created.path)}`, {
    data: { content: `---\ntitle: ${title}\n---\n${body}` },
    headers: { 'Content-Type': 'application/json' },
  });
  return created.path;
}
const read = async (page, notePath) => (await (await page.request.get(`/api/file?path=${encodeURIComponent(notePath)}`)).json()).content;

test.beforeEach(async ({ page }) => { await prepareMonos(page); });

for (const [name, ending] of Object.entries(ENDINGS)) {
  test(`текст после последнего блока (${name}) идёт новым абзацем`, async ({ page }) => {
    const title = uniqueTitle('After Last');
    const body = `Intro\n\n${ending}\n`;
    const notePath = await make(page, title, body);
    await openNote(page, title);
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    // A click in the empty space under the last block, then the end of the document: where the person goes to continue.
    await editor.click({ position: { x: 20, y: (await editor.boundingBox()).height - 4 } });
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('QQ');
    await waitForSavedContent(page, notePath, 'QQ');
    const saved = String(await read(page, notePath));
    // Either the caret landed in the last block (its own text grows) or below it (a new paragraph): never glued.
    expect(saved.startsWith(`---\ntitle: ${title}\n---\n`)).toBe(true);
    const text = saved.slice(saved.indexOf('Intro'));
    const below = `Intro\n\n${ending}\n\nQQ\n`;
    const inside = text.includes('QQ\n') && !text.includes(`${ending}QQ`);
    expect(text === below || inside).toBe(true);
    expect(text).not.toMatch(/(\*\*\*|---|```)QQ/);
  });
}
