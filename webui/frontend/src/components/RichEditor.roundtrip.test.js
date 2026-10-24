import { afterEach, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Editor } from '@tiptap/core';
import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
import { markdownToEditorContent } from '../lib/markdown-editor-content.js';
import { createNoteMarkdown } from '../lib/note-markdown.js';
import { replaceFrontmatterBody, splitFrontmatter } from '../lib/frontmatter.js';

// The product promise: a note is valid, portable Markdown at every moment and is not rewritten behind the
// person's back. Each sample is opened the way the editor opens a note, then written back the way it saves one.

const editors = [];
afterEach(() => {
  while (editors.length) editors.pop().destroy();
});

function open(markdown) {
  const editor = new Editor({
    element: null,
    extensions: createRichEditorExtensions('x'),
    content: markdownToEditorContent(markdown),
  });
  editors.push(editor);
  const note = createNoteMarkdown(editor);
  note.remember(markdown);
  return { editor, note };
}

// What Editor.svelte does with the editor's text: the body goes back under the frontmatter.
function saved(original, body) {
  return replaceFrontmatterBody(original, body);
}

function findText(editor, needle) {
  let found = null;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return;
    const at = node.text.indexOf(needle);
    if (at >= 0) found = { from: pos + at, to: pos + at + needle.length };
  });
  if (!found) throw new Error(`no text "${needle}" in the document`);
  return found;
}

function replaceText(editor, needle, next) {
  const { from, to } = findText(editor, needle);
  editor.view.dispatch(editor.state.tr.insertText(next, from, to));
}

// Type a letter and take it back: the document is the same again, though every node on the way was rebuilt.
function typeAndErase(editor) {
  let at = null;
  editor.state.doc.descendants((node, pos) => {
    if (at === null && node.isText) at = pos;
  });
  if (at === null) return false;
  editor.view.dispatch(editor.state.tr.insertText('Z', at, at));
  editor.view.dispatch(editor.state.tr.delete(at, at + 1));
  return true;
}

const CORPUS = {
  footnotes: 'A claim[^1] and another[^note].\n\n[^1]: The first source.\n[^note]: The second one.\n',
  'wiki embed': '![[embed.png]]\n\nAfter the picture.\n',
  'wiki embed in a sentence': 'See ![[a.png]] and ![[Other note]] here.\n',
  'code fence with a language': '```js\nconst a = 1;\n```\n\n```bash\nls -la\n```\n',
  'tilde fence': '~~~python\nprint(1)\n~~~\n',
  'indented code beside a fence': '    indented\n\n```ts\nlet x: number;\n```\n',
  'ordered list from 5': '5. five\n6. six\n7. seven\n',
  'ordered list with a bracket': '7) seven\n8) eight\n',
  'angle brackets and ampersand': 'a < b > c & d, 1<2, x -> y, <br> and AT&T.\n',
  'ends with a list': 'Intro\n\n- one\n- two\n',
  'ends with a quote': 'Intro\n\n> a quote\n',
  'ends with a code block': 'Intro\n\n```\ncode\n```\n',
  'ends with a rule': 'Intro\n\n---\n',
  'tight nested task list': '- [ ] one\n  - [x] nested\n  - [ ] other\n- [x] two\n',
  'loose task list': '- [ ] one\n\n- [x] two\n',
  strikethrough: 'This is ~~gone~~ and H~2~O and ~maybe~.\n',
  'table with an escaped pipe': '| a | b |\n| --- | --- |\n| x \\| y | 2 |\n| 3 | 4 |\n',
  'star bullets': '* one\n* two\n\n+ plus\n+ list\n',
  'setext headings': 'Title\n=====\n\nSub\n---\n\nText\n',
  'heading glued to text': '# Heading\nright under it\n\n## Next\n',
  'several blank lines': 'one\n\n\n\ntwo\n',
  'no final newline': 'one\n\ntwo',
  'two final newlines': 'one\n\ntwo\n\n',
  'emphasis styles': '_one_ *two* __three__ **four** `code`\n',
  'link reference definition': 'See [the site][s].\n\n[s]: https://example.com "Title"\n',
  'hard break and soft break': 'line one\nline two  \nline three\\\nline four\n',
  entities: 'Fish &amp; chips &copy; &lt;tag&gt;\n',
  'nested quote with a list': '> quote\n>\n> - item\n> - item\n',
  callout: '> [!warning] Careful\n> text here\n',
  math: '$$\nE = mc^2\n$$\n\nInline $a+b$ formula.\n',
  mermaid: '```mermaid\ngraph TD; A-->B;\n```\n',
  'empty lines made with enter': 'one\n\n&nbsp;\n\ntwo\n',
  'image and link': '![alt text](_attachments/pic.png "Title")\n\n[label](https://example.com)\n',
  'mixed list': '- plain\n- [ ] task\n- plain again\n',
  'long ordered list': '9. nine\n10. ten\n11. eleven\n',
  'backslashes and stars': 'C:\\Users\\me and 2 * 3 and a*b*c\n',
  'brackets that are not links': 'Array[0] and [x] and [[Wiki link]]\n',
  'mixed list with several runs': '- a\n- [ ] b\n- [x] c\n- d\n- [ ] e\n',
  'table with alignment': '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n',
  crlf: 'one\r\n\r\ntwo\r\n\r\n- a\r\n- b\r\n',
};

for (const [name, markdown] of Object.entries(CORPUS)) {
  test(`${name}: opened and saved without an edit it is the same bytes`, () => {
    const { note } = open(markdown);
    expect(note.serialize()).toBe(markdown);
  });

  test(`${name}: a letter typed and erased changes nothing`, () => {
    const { editor, note } = open(markdown);
    if (!typeAndErase(editor)) return; // a note of nothing but a diagram has no text to type in
    expect(note.serialize()).toBe(markdown);
  });

  test(`${name}: under frontmatter the note is the same bytes too`, () => {
    const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
    for (const fm of ['---\ntitle: T\ntags:\n  - a\n---\n\n', '---\ntitle: T\n---\n']) {
      const original = fm.replace(/\n/g, eol) + markdown;
      const { body } = splitFrontmatter(original);
      const { editor, note } = open(body);
      typeAndErase(editor);
      expect(saved(original, note.serialize())).toBe(original);
    }
  });
}

test('frontmatter with CRLF keeps its line endings and its blank line', () => {
  const original = '---\r\ntitle: T\r\n---\r\n\r\none\r\n\r\ntwo\r\n';
  const { body } = splitFrontmatter(original);
  const { editor, note } = open(body);
  typeAndErase(editor);
  expect(saved(original, note.serialize())).toBe(original);
});

test('an empty line made with Enter after a paragraph is still written', () => {
  const { editor, note } = open('one\n');
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  editor.commands.splitBlock();
  expect(note.serialize()).toBe('one\n\n&nbsp;\n');
});

test('the empty paragraph the editor adds after a final list is not written', () => {
  const markdown = 'Intro\n\n- one\n- two\n';
  const { editor, note } = open(markdown);
  // What the editor's trailing node does with the first transaction.
  editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, editor.schema.nodes.paragraph.create()));
  expect(editor.state.doc.lastChild.type.name).toBe('paragraph');
  expect(note.serialize()).toBe(markdown);
  expect(note.serialize()).not.toContain('&nbsp;');
});

// An edit in one paragraph leaves every other block byte for byte.
const EDIT_CASES = {
  footnotes: ['claim', 'A claim[^1] and another[^note].\n\n[^1]: The first source.\n[^note]: The second one.\n'],
  'wiki embed': ['After the picture.', '![[embed.png]]\n\nAfter the picture.\n'],
  'code fences': ['Intro', 'Intro\n\n```js\nconst a = 1;\n```\n\n~~~python\nprint(1)\n~~~\n\n5. five\n6. six\n'],
  'quotes and rules': ['Intro', 'Intro\n\n> a quote\n\n---\n\n* star\n* bullets\n'],
  'tasks and tables': ['Intro', 'Intro\n\n- [ ] one\n  - [x] nested\n- [x] two\n\n| a | b |\n| --- | --- |\n| x \\| y | 2 |\n'],
  'blank lines': ['one', 'one\n\n\n\ntwo\n\n&nbsp;\n\nthree\n'],
  strikethrough: ['This', 'This is ~~gone~~ and H~2~O.\n\ntwo\n'],
};
for (const [name, [needle, markdown]] of Object.entries(EDIT_CASES)) {
  test(`${name}: an edit in one paragraph leaves the others untouched`, () => {
    const { editor, note } = open(markdown);
    replaceText(editor, needle, 'EDITED');
    expect(note.serialize()).toBe(markdown.replace(needle, 'EDITED'));
  });
}

// Blocks the person did edit are written by the serializer, and it must not turn their text into something else.
const EDITED_BLOCKS = {
  'footnote reference and definition': ['A claim[^1] here.\n\n[^1]: The source.\n', 'claim', 'EDITED', 'A EDITED[^1] here.\n\n[^1]: The source.\n'],
  'definition edited': ['A claim[^1] here.\n\n[^1]: The source.\n', 'The source', 'The EDITED', 'A claim[^1] here.\n\n[^1]: The EDITED.\n'],
  'wiki embed': ['![[embed.png]] and text\n', 'text', 'EDITED', '![[embed.png]] and EDITED\n'],
  'ordered list start': ['5. five\n6. six\n', 'six', 'EDITED', '5. five\n6. EDITED\n'],
  'ordered list bracket': ['7) seven\n8) eight\n', 'eight', 'EDITED', '7) seven\n8) EDITED\n'],
  'angle brackets': ['a < b > c & d\n', 'a <', 'EDITED <', 'EDITED < b > c & d\n'],
  'tight nested tasks': ['- [ ] one\n  - [x] nested\n  - [ ] other\n- [x] two\n', 'one', 'EDITED', '- [ ] EDITED\n  - [x] nested\n  - [ ] other\n- [x] two\n'],
  'code language': ['```js\nconst a = 1;\n```\n', 'const', 'let', '```js\nlet a = 1;\n```\n'],
  strike: ['~~gone~~ and ~sub~ text\n', 'text', 'EDITED', '~~gone~~ and ~sub~ EDITED\n'],
  'table pipe': ['| a | b |\n| --- | --- |\n| x \\| y | 2 |\n', '2', '3', '| a | b |\n| --- | --- |\n| x \\| y | 3 |\n'],
  'star bullets': ['* one\n* two\n', 'two', 'EDITED', '* one\n* EDITED\n'],
  'loose list': ['- one\n\n- two\n', 'two', 'EDITED', '- one\n\n- EDITED\n'],
  'mixed bullet and task list': ['- plain\n- [ ] task\n- plain again\n', 'task', 'EDITED', '- plain\n- [ ] EDITED\n- plain again\n'],
  'mixed list edited in a plain item': ['- [x] done\n- plain\n- [ ] task\n', 'plain', 'EDITED', '- [x] done\n- EDITED\n- [ ] task\n'],
  'loose mixed list': ['- plain\n\n- [ ] task\n\n- plain again\n', 'task', 'EDITED', '- plain\n\n- [ ] EDITED\n\n- plain again\n'],
  'nested mixed list': ['- parent\n  - plain\n  - [ ] task\n- other\n', 'task', 'EDITED', '- parent\n  - plain\n  - [ ] EDITED\n- other\n'],
  'table alignment': ['| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n', '2', 'EDITED', '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | EDITED | 3 |\n'],
};
for (const [name, [markdown, needle, next, expected]] of Object.entries(EDITED_BLOCKS)) {
  test(`${name}: the edited block is written without damage, and saving twice gives the same text`, () => {
    const { editor, note } = open(markdown);
    replaceText(editor, needle, next);
    const first = note.serialize();
    expect(first).toBe(expected);
    const again = open(first);
    expect(again.note.serialize()).toBe(first);
  });
}

// Real notes: the project's own documentation is a few dozen documents written by hand and by tools.
// vitest runs from webui/frontend.
const DOCS = `${resolve(process.cwd(), '../../docs')}/`;
for (const name of readdirSync(DOCS).filter((file) => file.endsWith('.md'))) {
  test(`docs/${name}: opens and saves unchanged, and one edited paragraph changes only itself`, () => {
    const markdown = splitFrontmatter(readFileSync(DOCS + name, 'utf8')).body;
    const { editor, note } = open(markdown);
    expect(note.serialize()).toBe(markdown);
    if (typeAndErase(editor)) expect(note.serialize()).toBe(markdown);

    const blocks = [];
    editor.state.doc.forEach((node, offset) => blocks.push([node, offset]));
    const middle = blocks.findIndex(([node], index) => index >= blocks.length / 2 && node.type.name === 'paragraph' && node.textContent.length > 3);
    if (middle < 0) return;
    editor.view.dispatch(editor.state.tr.insertText('EDITED ', blocks[middle][1] + 1, blocks[middle][1] + 1));
    const before = markdown.split('\n\n');
    const after = note.serialize().split('\n\n');
    const changed = after.filter((part, index) => part !== before[index]);
    expect(after.length).toBe(before.length);
    expect(changed.length).toBe(1);
  });
}
