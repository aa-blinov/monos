import { expect, test } from '@playwright/test';
import { prepareMonos } from './support/monos.js';

// A note is valid Markdown the person wrote. Editing one paragraph must not respell the rest of the file:
// footnotes, wiki embeds, fence languages, list numbers, `<` and `~`, table pipes, the end of the note.
const BODY = [
  'First paragraph.',
  'A claim[^1] with a < b > c & d and H~2~O and ~~gone~~.',
  '[^1]: The source.',
  '![[embed.png]]',
  '```js\nconst a = 1;\n```',
  '5. five\n6. six',
  '7) seven\n8) eight',
  '- [ ] one\n  - [x] nested\n  - [ ] other\n- [x] two',
  '| a | b |\n| --- | --- |\n| x \\| y | 2 |',
  '- last\n- list',
].join('\n\n') + '\n';

function bodyOf(content) {
  return String(content).replace(/^---\n[\s\S]*?\n---\n+/, '');
}

test('одна правка в первом абзаце не переписывает остальной файл', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const title = `Keep ${Date.now()}`;
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: 'Keep', tags: [], content: BODY } })).json();
  const query = `path=${encodeURIComponent(created.path)}`;
  const original = String((await (await page.request.get(`/api/file?${query}`)).json()).content);

  const route = `/notes/${created.path.replace(/^notes\//, '').split('/').map(encodeURIComponent).join('/')}`;
  await page.goto(route);
  const editor = page.getByTestId('rich-editor-input');
  await expect(editor.locator('p').first()).toContainText('First paragraph.');

  // A letter typed and taken back: the file is the same bytes.
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(2500);
  expect(String((await (await page.request.get(`/api/file?${query}`)).json()).content)).toBe(original);

  // A letter that stays: only the first paragraph differs.
  await page.keyboard.type('!');
  await expect.poll(async () => bodyOf((await (await page.request.get(`/api/file?${query}`)).json()).content), { timeout: 10_000 })
    .toBe(BODY.replace('First paragraph.', 'First paragraph.!'));
});

// A block the person does edit is written again by the serializer, and it keeps what the file had in it: a list that
// mixes bullets and tasks stays one list, a table keeps the alignment of its columns.
const EDITED = '- plain\n- [ ] task\n- plain again\n\n| a | b | c |\n| :--- | :---: | ---: |\n| 1 | two | 3 |\n';

test('правка в смешанном списке и в таблице не ломает список и выравнивание колонок', async ({ page }) => {
  await prepareMonos(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const title = `Keep edited ${Date.now()}`;
  const created = await (await page.request.post('/api/notes/create', { data: { title, category: 'Keep', tags: [], content: EDITED } })).json();
  const query = `path=${encodeURIComponent(created.path)}`;
  const route = `/notes/${created.path.replace(/^notes\//, '').split('/').map(encodeURIComponent).join('/')}`;
  await page.goto(route);
  const editor = page.getByTestId('rich-editor-input');
  await expect(editor).toContainText('plain again');

  await editor.getByText('task', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await editor.locator('td', { hasText: 'two' }).click({ clickCount: 3 });
  await page.keyboard.type('TWO');
  await expect.poll(async () => bodyOf((await (await page.request.get(`/api/file?${query}`)).json()).content), { timeout: 10_000 })
    .toBe(EDITED.replace('task', 'task!').replace('two', 'TWO'));
});
