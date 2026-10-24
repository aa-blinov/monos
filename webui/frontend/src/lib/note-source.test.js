import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceMap, splitSource, writeWithSource } from './note-source.js';

function fakeNode(type, text) {
  return {
    type: { name: type },
    text,
    eq(other) { return other.type.name === type && other.text === text; },
    toJSON() { return { type, text }; },
  };
}

test('splitSource cuts the text into blocks without losing a character', () => {
  for (const markdown of [
    'one\n\ntwo\n',
    '\n\n# H\ntext\n\n\n\n- a\n- b\n\n```js\ncode\n```\n   \n> q',
    '[ref]: https://example.com\n\nSee [x][ref].\n',
    '| a | b |\n| - | - |\n| 1 | 2 |\n\nafter\n',
    'no final newline',
    '',
  ]) {
    const { lead, blocks, tail } = splitSource(markdown);
    const rebuilt = lead + blocks.map((block, index) => block.text + block.gap).join('') + (blocks.length ? tail : '');
    assert.equal(rebuilt, markdown.replace(/\r\n/g, '\n'));
  }
});

test('splitSource names the kind of each block and keeps tight blocks tight', () => {
  const { blocks } = splitSource('# H\ntext\n\n- a\n\n---\n\n1. x\n');
  assert.deepEqual(blocks.map((block) => block.kind), ['heading_open', 'paragraph_open', 'bullet_list_open', 'hr', 'ordered_list_open']);
  assert.equal(blocks[0].gap, '\n');
  assert.equal(blocks[1].gap, '\n\n');
});

test('splitSource remembers CRLF and reads the text as LF', () => {
  const { eol, blocks } = splitSource('one\r\n\r\ntwo\r\n');
  assert.equal(eol, '\r\n');
  assert.deepEqual(blocks.map((block) => block.text), ['one', 'two']);
});

test('writeWithSource writes untouched blocks as they were and only renders the changed one', () => {
  const markdown = '* one\n\n\n~~~py\nx\n~~~\n\nlast\n';
  const nodes = [fakeNode('bulletList', 'one'), fakeNode('codeBlock', 'x'), fakeNode('paragraph', 'last')];
  const map = buildSourceMap(markdown, nodes);
  const untouched = writeWithSource(map, nodes, () => assert.fail('nothing to render'));
  assert.equal(untouched, markdown);

  const edited = [nodes[0], nodes[1], fakeNode('paragraph', 'LAST')];
  assert.equal(writeWithSource(map, edited, (node) => node.text), '* one\n\n\n~~~py\nx\n~~~\n\nLAST\n');
});

test('a node that is exactly the original again counts as untouched (typed and erased)', () => {
  const markdown = 'a\n\nb\n';
  const nodes = [fakeNode('paragraph', 'a'), fakeNode('paragraph', 'b')];
  const map = buildSourceMap(markdown, nodes);
  const rebuilt = [fakeNode('paragraph', 'a'), fakeNode('paragraph', 'b')];
  assert.equal(writeWithSource(map, rebuilt, () => assert.fail('nothing to render')), markdown);
});

test('a deleted block takes its text away and leaves the rest alone', () => {
  const markdown = 'a\n\nb\n\nc\n';
  const nodes = [fakeNode('paragraph', 'a'), fakeNode('paragraph', 'b'), fakeNode('paragraph', 'c')];
  const map = buildSourceMap(markdown, nodes);
  assert.equal(writeWithSource(map, [nodes[0], nodes[2]], () => assert.fail('nothing to render')), 'a\n\nc\n');
});

test('two paragraphs never end up touching, even when the gap they replace was tight', () => {
  const markdown = '# H\ntext\n';
  const nodes = [fakeNode('heading', 'H'), fakeNode('paragraph', 'text')];
  const map = buildSourceMap(markdown, nodes);
  const edited = [fakeNode('paragraph', 'H2'), nodes[1]];
  assert.equal(writeWithSource(map, edited, (node) => node.text), 'H2\n\ntext\n');
});

test('a paragraph edited in place keeps the tight gap before a list', () => {
  const markdown = '**Title**\n1. one\n2. two\n';
  const nodes = [fakeNode('paragraph', 'Title'), fakeNode('orderedList', 'one')];
  const map = buildSourceMap(markdown, nodes);
  assert.equal(writeWithSource(map, [fakeNode('paragraph', 'T'), nodes[1]], (node) => node.text), 'T\n1. one\n2. two\n');
});

test('a block that became several nodes passes through while they are all still there', () => {
  const markdown = 'See ![[Other]] here.\n\nnext\n';
  const nodes = [fakeNode('paragraph', 'See'), fakeNode('noteEmbed', 'Other'), fakeNode('paragraph', 'here'), fakeNode('paragraph', 'next')];
  const map = buildSourceMap(markdown, nodes, { countNodes: (text) => (text.startsWith('See') ? 3 : 1) });
  assert.equal(writeWithSource(map, nodes, () => assert.fail('nothing to render')), markdown);
  const withoutEnd = [nodes[0], nodes[1], fakeNode('paragraph', 'here!'), nodes[3]];
  assert.equal(writeWithSource(map, withoutEnd, (node) => `<${node.text}>`), '<See>\n\n<Other>\n\n<here!>\n\nnext\n');
});

test('buildSourceMap gives up when the blocks and the nodes cannot be lined up', () => {
  assert.equal(buildSourceMap('a\n\nb\n', [fakeNode('paragraph', 'a')]), null);
  assert.equal(buildSourceMap('a\n\nb\n', [fakeNode('heading', 'a'), fakeNode('paragraph', 'b')]), null);
  assert.equal(buildSourceMap('', [fakeNode('paragraph', '')]), null);
});

test('without a map everything is rendered, with a blank line between blocks', () => {
  const nodes = [fakeNode('paragraph', 'a'), fakeNode('paragraph', 'b')];
  assert.equal(writeWithSource(null, nodes, (node) => node.text), 'a\n\nb');
});

test('the empty paragraph the editor adds at the end is dropped', () => {
  const nodes = [fakeNode('bulletList', 'a'), fakeNode('paragraph', '')];
  const out = writeWithSource(null, nodes, (node) => node.text || '', {
    isTrailingGap: (node, previous) => node.type.name === 'paragraph' && node.text === '' && previous?.type.name !== 'paragraph',
  });
  assert.equal(out, 'a');
});

test('CRLF notes are written back with CRLF', () => {
  const markdown = 'one\r\n\r\ntwo\r\n';
  const nodes = [fakeNode('paragraph', 'one'), fakeNode('paragraph', 'two')];
  const map = buildSourceMap(markdown, nodes);
  assert.equal(writeWithSource(map, [nodes[0], fakeNode('paragraph', 'TWO')], (node) => node.text), 'one\r\n\r\nTWO\r\n');
});
