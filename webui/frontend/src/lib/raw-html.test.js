import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRawHtml } from './raw-html.js';

test('HTML-теги и комментарии вне кода находятся', () => {
  assert.equal(hasRawHtml('<div>x</div>'), true);
  assert.equal(hasRawHtml('до <br> после'), true);
  assert.equal(hasRawHtml('до <br/> после'), true);
  assert.equal(hasRawHtml('<img src="a.png" width="20">'), true);
  assert.equal(hasRawHtml('текст\n\n<!-- скрытая заметка -->\n'), true);
  assert.equal(hasRawHtml('нажмите <kbd>Ctrl</kbd>'), true);
});

test('код, front matter, автоссылки и сравнения HTML не считаются', () => {
  assert.equal(hasRawHtml('```html\n<div>x</div>\n```\n'), false);
  assert.equal(hasRawHtml('~~~\n<b>x</b>\n~~~\n'), false);
  assert.equal(hasRawHtml('тег `<div>` в коде'), false);
  assert.equal(hasRawHtml('---\ntitle: <b>\n---\nтекст'), false);
  assert.equal(hasRawHtml('смотри <https://example.com> и <me@example.com>'), false);
  assert.equal(hasRawHtml('если a < b и c > d, то всё хорошо'), false);
  assert.equal(hasRawHtml('3<5 и 7>2'), false);
  assert.equal(hasRawHtml(''), false);
  assert.equal(hasRawHtml(null), false);
});

test('HTML после блока кода находится', () => {
  assert.equal(hasRawHtml('```\ncode\n```\n\n<span>x</span>'), true);
});
