import test from 'node:test';
import assert from 'node:assert/strict';
import { InlineMath, MathBlock, MermaidBlock, NoteEmbed, embedHtml } from './richEditorExtras.js';

// TipTap tells the nodes apart by these names, so renaming one silently breaks
// every note that already uses it.
test('узлы формул, диаграмм и вложенных заметок сохраняют свои имена', () => {
  assert.deepEqual(
    [InlineMath, MathBlock, MermaidBlock, NoteEmbed].map((node) => node.name),
    ['inlineMath', 'mathBlock', 'mermaidBlock', 'noteEmbed'],
  );
});

// Each branch escapes its own text, so each one needs a case: a fix in one
// branch says nothing about the other four.
test('вставка экранирует текст в каждой из пяти веток, в том числе в обычном абзаце', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const escaped = '&lt;img src=x onerror=alert(1)&gt;';
  const cases = [
    ['кодовый блок', '```' + payload, '<pre class="embed-code">```' + escaped + '</pre>'],
    ['заголовок', '# ' + payload, `<h3>${escaped}</h3>`],
    ['пункт списка', '- ' + payload, `<p class="embed-li">• ${escaped}</p>`],
    ['цитата', '> ' + payload, `<blockquote>${escaped}</blockquote>`],
    [
      'абзац',
      'Buy milk ' + payload + ' and **bread**, *jam*, `tea` and ~~old~~',
      `<p>Buy milk ${escaped} and <strong>bread</strong>, <em>jam</em>, <code>tea</code> and <del>old</del></p>`,
    ],
  ];
  for (const [branch, markdown, html] of cases) {
    assert.equal(embedHtml(markdown), html, branch);
  }
});
