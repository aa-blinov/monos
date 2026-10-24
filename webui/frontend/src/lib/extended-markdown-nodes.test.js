import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtendedMarkdown, FootnoteDefinition, FootnoteRef, Highlight, Subscript, Superscript } from './extended-markdown-nodes.js';

// What a prosemirror-markdown serializer state records of the calls the writers make.
function fakeState() {
  const calls = [];
  return {
    calls,
    text: (value, escape) => calls.push(['text', value, escape]),
    write: (value) => calls.push(['write', value]),
    renderInline: (node, fromBlockStart) => calls.push(['renderInline', fromBlockStart]),
    closeBlock: () => calls.push(['closeBlock']),
  };
}

const storage = (extension) => extension.config.addStorage.call({}).markdown;

test('the marks are written back as the markers they were read from', () => {
  assert.deepEqual([Highlight, Subscript, Superscript].map((mark) => storage(mark).serialize.open), ['==', '~', '^']);
  for (const mark of [Highlight, Subscript, Superscript]) {
    const { serialize } = storage(mark);
    assert.equal(serialize.open, serialize.close);
    // `== x ==` is not a highlight: the spaces leave the marker.
    assert.equal(serialize.expelEnclosingWhitespace, true);
  }
});

test('a footnote reference is written as [^label] without escaping', () => {
  const state = fakeState();
  storage(FootnoteRef).serialize(state, { attrs: { label: 'note' } });
  assert.deepEqual(state.calls, [['text', '[^note]', false]]);
});

test('a footnote definition is written as [^label]: and its text, not as the start of a line', () => {
  const state = fakeState();
  storage(FootnoteDefinition).serialize(state, { attrs: { label: '1' } });
  assert.deepEqual(state.calls, [['write', '[^1]: '], ['renderInline', false], ['closeBlock']]);
});

test('typing the closing marker matches the text between the markers only', () => {
  const finders = {
    highlight: /(?:^|\s)(==(?!\s)([^=]*[^=\s])==)$/,
    subscript: /(?<!~)~([^~\s]+)~$/,
    superscript: /\^([^^\s]+)\^$/,
  };
  const rules = {
    highlight: Highlight.config.addInputRules.call({ type: {} })[0].find,
    subscript: Subscript.config.addInputRules.call({ type: {} })[0].find,
    superscript: Superscript.config.addInputRules.call({ type: {} })[0].find,
  };
  for (const [name, find] of Object.entries(rules)) assert.equal(String(find), String(finders[name]));
  assert.ok(rules.highlight.test('a ==two words=='));
  assert.ok(!rules.highlight.test('a == b =='));
  assert.ok(rules.subscript.test('H~2~'));
  assert.ok(!rules.subscript.test('~~gone~'), 'the second tilde of a strikethrough opens no subscript');
  assert.ok(!rules.subscript.test('~5 minutes~'));
  assert.ok(rules.superscript.test('x^2^'));
  assert.ok(!rules.superscript.test('x^2 and 3^'));
});

test('the footnote reference input rule takes [^label] with no spaces', () => {
  const [rule] = FootnoteRef.config.addInputRules.call({ type: {} });
  assert.ok(rule.find.test('text[^1]'));
  assert.ok(!rule.find.test('[^a b]'));
});

test('every extension of the bundle has a name the editor schema and the parser share', () => {
  assert.deepEqual(ExtendedMarkdown.map((extension) => extension.name), ['highlight', 'subscript', 'superscript', 'footnoteRef', 'footnoteDefinition']);
});
