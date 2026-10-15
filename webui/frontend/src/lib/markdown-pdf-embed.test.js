import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToEditorContent, normalizeObsidianEmbeds } from './markdown-editor-content.js';
import { firstPdfFileFromDataTransfer, isPdfFile } from './attachments.js';

test('![[файл.pdf]] становится узлом PDF; картинки и заметки разбираются как раньше', () => {
  const nodes = normalizeObsidianEmbeds('См. ![[Spec.pdf]] и ![[pic.png]] и ![[Заметка]]');
  assert.deepEqual(nodes.filter((node) => node.type !== 'text'), [
    { type: 'pdfEmbed', attrs: { name: 'Spec.pdf', src: '_attachments/Spec.pdf' } },
    { type: 'image', attrs: { src: '_attachments/pic.png', alt: 'pic', title: null } },
    { type: 'noteEmbed', attrs: { name: 'Заметка' } },
  ]);
});

test('абзац с PDF разрезается: текст до и после — отдельные абзацы, рамка между ними блочная', () => {
  const doc = markdownToEditorContent('Договор: ![[Contract.pdf]]\n\nКонец');
  assert.deepEqual(doc.content.map((node) => node.type), ['paragraph', 'pdfEmbed', 'paragraph']);
  assert.equal(doc.content[0].content[0].text, 'Договор: ');
  assert.deepEqual(doc.content[1].attrs, { name: 'Contract.pdf', src: '_attachments/Contract.pdf' });
});

test('PDF узнаётся по типу файла, а из перетаскивания берётся первый PDF', () => {
  assert.equal(isPdfFile({ type: 'application/pdf' }), true);
  assert.equal(isPdfFile({ type: 'image/png' }), false);
  const dataTransfer = { files: [{ type: 'image/png', name: 'a.png' }, { type: 'application/pdf', name: 'b.pdf' }] };
  assert.equal(firstPdfFileFromDataTransfer(dataTransfer).name, 'b.pdf');
  assert.equal(firstPdfFileFromDataTransfer({ files: [] }), null);
});
