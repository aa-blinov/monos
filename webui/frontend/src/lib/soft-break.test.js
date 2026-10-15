import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftBreak } from './soft-break.js';

const markdown = SoftBreak.config.addStorage().markdown;

test('мягкий перенос разбирается в отдельный узел, а не в пробел', () => {
  const rules = { softbreak: () => '\n' };
  markdown.parse.setup({ renderer: { rules } });
  assert.equal(rules.softbreak(), '<span data-soft-break></span>');
  assert.deepEqual(SoftBreak.config.parseHTML(), [{ tag: 'span[data-soft-break]' }]);
});

test('узел пишется обратно как перевод строки, без лишних символов', () => {
  const written = [];
  markdown.serialize({ write: (text) => written.push(text) });
  assert.deepEqual(written, ['\n']);
});

test('в редакторе и в тексте узел виден пробелом, как в предпросмотре', () => {
  assert.equal(SoftBreak.config.renderHTML().length, 3);
  assert.equal(SoftBreak.config.renderHTML()[2], ' ');
  assert.equal(SoftBreak.config.renderText(), ' ');
});
