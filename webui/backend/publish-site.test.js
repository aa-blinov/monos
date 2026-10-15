import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The module reads the notes folder at import: keep the test away from the real data.
process.env.NOTES_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-publish-unit-'));
const { renderNoteBody } = await import('./publish-site.js');

// The context a page gets: notes on the page's own folder, links resolved by name, assets copied on use.
function context({ pageDir = 'pages/Work', resolved = {} } = {}) {
  return {
    pageDir,
    assetHref: (src) => (/^(https?:|data:|#)/.test(src) ? src : `../../assets/Work/${src.replace(/^_attachments\//, '_attachments/')}`),
    resolve: (name) => resolved[name] || null,
  };
}

test('сырой HTML из заметки показывается текстом, а не выполняется', () => {
  const html = renderNoteBody('Вот <script>alert(1)</script> и <b>жирно</b>', context());
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('[[ссылка]] на опубликованную заметку становится относительной ссылкой, непубликованная — текстом', () => {
  const resolved = { Plan: 'pages/Work/Plan.html' };
  const html = renderNoteBody('См. [[Plan]], [[Plan|план]] и [[Нет такой]].', context({ resolved }));
  assert.ok(html.includes('<a href="Plan.html">Plan</a>'), html);
  assert.ok(html.includes('<a href="Plan.html">план</a>'), html);
  assert.ok(html.includes('<span class="unlinked">Нет такой</span>'), html);
});

test('ссылки внутри кода не трогаются', () => {
  const html = renderNoteBody('В коде `[[Plan]]` и\n\n```\n[[Plan]]\n```\n', context({ resolved: { Plan: 'pages/Work/Plan.html' } }));
  assert.equal(html.includes('href="Plan.html"'), false);
  assert.ok(html.includes('[[Plan]]'));
});

test('PDF-вложение встраивается рамкой, картинка — тегом img, оба по относительному пути', () => {
  const html = renderNoteBody('![[Spec.pdf]]\n\n![[pic.png]]\n\n![подпись](_attachments/shot.png)', context());
  assert.ok(html.includes('<div class="pdf">'), html);
  assert.ok(html.includes('<iframe src="../../assets/Work/_attachments/Spec.pdf"'), html);
  assert.ok(html.includes('<img src="../../assets/Work/_attachments/pic.png" alt="pic">'), html);
  assert.ok(html.includes('src="../../assets/Work/_attachments/shot.png"'), html);
});

test('выноска Obsidian помечается классом, javascript-ссылка становится безопасной', () => {
  const html = renderNoteBody('> [!warning] Осторожно\n> текст\n\n[плохо](javascript:alert(1))', context());
  assert.ok(html.includes('<blockquote class="callout callout-warning">'), html);
  assert.equal(html.includes('javascript:'), false);
});

test('frontmatter в страницу не попадает', () => {
  const html = renderNoteBody('---\ntitle: Секрет\n---\n\nТекст', context());
  assert.equal(html.includes('title: Секрет'), false);
  assert.ok(html.includes('Текст'));
});
