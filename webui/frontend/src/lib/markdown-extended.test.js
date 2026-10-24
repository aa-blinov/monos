import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToEditorContent } from './markdown-editor-content.js';
import { escapeInline } from './markdown-fidelity.js';

const paragraph = (markdown) => markdownToEditorContent(markdown).content[0];
// [text, marks] pairs of the first paragraph: what a reader sees, without the node plumbing.
const runs = (markdown) => paragraph(markdown).content.map((node) => (
  node.type === 'text'
    ? [node.text, (node.marks || []).map((mark) => mark.type).join('+')]
    : [`<${node.type}:${node.attrs.label}>`, '']
));
const plain = (markdown) => assert.deepEqual(runs(markdown).map(([, marks]) => marks).filter(Boolean), [], markdown);

test('==text== is a highlight', () => {
  assert.deepEqual(runs('a ==hi== b'), [['a ', ''], ['hi', 'highlight'], [' b', '']]);
});

test('a highlight may hold spaces and other marks', () => {
  assert.deepEqual(runs('==two words=='), [['two words', 'highlight']]);
  assert.deepEqual(runs('==*a* **b**=='), [['a', 'italic+highlight'], [' ', 'highlight'], ['b', 'bold+highlight']]);
});

test('what is not a highlight stays text', () => {
  for (const source of ['a == b', 'a == b ==', '==', '====', '== x==', '==x ==', '\\==x==', 'a ==b', '===x===']) plain(source);
  assert.equal(paragraph('a == b').content[0].text, 'a == b');
  assert.equal(paragraph('\\==x==').content[0].text, '==x==');
});

test('H~2~O is a subscript and x^2^ is a superscript', () => {
  assert.deepEqual(runs('H~2~O'), [['H', ''], ['2', 'subscript'], ['O', '']]);
  assert.deepEqual(runs('x^2^ + y^n^'), [['x', ''], ['2', 'superscript'], [' + y', ''], ['n', 'superscript']]);
});

test('a single tilde is a subscript and a double one is still a strikethrough', () => {
  assert.deepEqual(runs('~~gone~~ H~2~O'), [['gone', 'strike'], [' H', ''], ['2', 'subscript'], ['O', '']]);
});

test('tilde and caret in prose are not marks', () => {
  for (const source of ['~5 minutes', 'about ~5 minutes or ~10', 'x^2', 'x^2 and 2^10 and 3^4', 'a ~ b ~ c', '2^ 3^', '\\~x\\~', 'a\\^b\\^']) plain(source);
});

test('no mark inside a code span or a fenced block', () => {
  assert.deepEqual(runs('`==x==` `~y~` `^z^`').map(([, marks]) => marks), ['code', '', 'code', '', 'code']);
  const fenced = markdownToEditorContent('```\n==x== H~2~O x^2^ [^1]\n```\n').content[0];
  assert.equal(fenced.type, 'codeBlock');
  assert.equal(fenced.content[0].text, '==x== H~2~O x^2^ [^1]');
});

test('a closing marker inside a code span does not close', () => {
  assert.deepEqual(runs('==a `b==` c==').map(([, marks]) => marks), ['highlight', 'code+highlight', 'highlight']);
});

test('a footnote reference with a definition is a node', () => {
  const doc = markdownToEditorContent('A claim[^1] here.\n\n[^1]: The source.\n').content;
  assert.deepEqual(doc[0].content.map((node) => node.type), ['text', 'footnoteRef', 'text']);
  assert.equal(doc[0].content[1].attrs.label, '1');
  assert.equal(doc[1].type, 'footnoteDefinition');
  assert.equal(doc[1].attrs.label, '1');
  assert.equal(doc[1].content[0].text, 'The source.');
});

test('definitions on consecutive lines are separate blocks, and a URL does not make a link reference', () => {
  const doc = markdownToEditorContent('x[^a][^b]\n\n[^a]: one\n[^b]: https://example.com\n').content;
  assert.deepEqual(doc.map((node) => node.type), ['paragraph', 'footnoteDefinition', 'footnoteDefinition']);
  assert.equal(doc[2].content[0].text, 'https://example.com');
  assert.deepEqual(doc[0].content.map((node) => node.type), ['text', 'footnoteRef', 'footnoteRef']);
});

test('a reference without a definition is the text it looks like', () => {
  assert.equal(paragraph('Alone[^1] and [^note].').content.map((node) => node.text).join(''), 'Alone[^1] and [^note].');
  assert.ok(paragraph('Alone[^1] and [^note].').content.every((node) => node.type === 'text' && !node.marks));
  // A definition for another label does not help.
  assert.ok(markdownToEditorContent('a[^1]\n\n[^2]: x\n').content[0].content.every((node) => node.type === 'text'));
});

test('a reference in a table cell finds a definition outside the table', () => {
  const doc = markdownToEditorContent('| a | b |\n| --- | --- |\n| x | y[^1] |\n\n[^1]: note\n').content;
  const cell = doc[0].content[1].content[1].content[0];
  assert.deepEqual(cell.content.map((node) => node.type), ['text', 'footnoteRef']);
});

test('[^1](url) is a link, not a footnote', () => {
  assert.equal(paragraph('[^1](https://x.org)').content[0].marks[0].type, 'link');
});

test('text that would read back as a mark is escaped, and prose is not', () => {
  assert.equal(escapeInline('==x== and ==y=='), '\\==x\\== and \\==y\\==');
  assert.equal(escapeInline('a == b'), 'a == b');
  assert.equal(escapeInline('~x~'), '\\~x\\~');
  assert.equal(escapeInline('~5 minutes'), '~5 minutes');
  assert.equal(escapeInline('x^2^'), 'x\\^2\\^');
  assert.equal(escapeInline('x^2 and 2^10'), 'x^2 and 2^10');
  assert.equal(escapeInline('[^1] stays'), '[^1] stays');
});
