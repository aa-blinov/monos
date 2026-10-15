import test from 'node:test';
import assert from 'node:assert/strict';
import { BLANK_LINE, EditableParagraph, isBlankLineNode } from './blank-line.js';
import { markdownToEditorContent } from './markdown-editor-content.js';

const NBSP = ' ';

test('абзац из одних неразрывных пробелов — пустая строка, обычный текст — нет', () => {
  assert.equal(isBlankLineNode({ type: 'paragraph', content: [{ type: 'text', text: NBSP + NBSP }] }), true);
  assert.equal(isBlankLineNode({ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }), false);
  assert.equal(isBlankLineNode({ type: 'paragraph', content: [] }), false);
  assert.equal(isBlankLineNode({ type: 'paragraph' }), false);
});

test('пустой абзац пишется в markdown как &nbsp;, а не как ничего', () => {
  const markdown = EditableParagraph.config.addStorage().markdown;
  const written = [];
  let closed = false;
  markdown.serialize({
    write: (text) => written.push(text),
    renderInline: () => written.push('<inline>'),
    closeBlock: () => { closed = true; },
  }, { content: { size: 0 } });
  assert.deepEqual(written, [BLANK_LINE]);
  assert.equal(closed, true);
});

test('&nbsp; в тексте файла становится пустым абзацем, а не текстом', () => {
  const doc = markdownToEditorContent('&nbsp;\n\nПервая строка\n');
  assert.equal(doc.content[0].type, 'paragraph');
  assert.equal((doc.content[0].content || []).length, 0);
  assert.equal(doc.content[1].content[0].text, 'Первая строка');
});

test('пустые строки между абзацами сохраняются как отдельные пустые абзацы', () => {
  const doc = markdownToEditorContent('Первая\n\n&nbsp;\n\nВторая\n');
  assert.deepEqual(doc.content.map((node) => node.content?.[0]?.text ?? null), ['Первая', null, 'Вторая']);
});
