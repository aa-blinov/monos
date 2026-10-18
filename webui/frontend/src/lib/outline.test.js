import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOutline, findHeadingPos, plainHeadingText, slugifyAnchor, withOccurrences } from './outline.js';

test('slugifyAnchor: ascii lowercase + дефисы', () => {
  assert.equal(slugifyAnchor('Hello World'), 'hello-world');
  assert.equal(slugifyAnchor('  Multiple   Spaces  '), 'multiple-spaces');
  assert.equal(slugifyAnchor('Special: chars!?'), 'special-chars');
  assert.equal(slugifyAnchor('Cyrillic текст'), 'cyrillic-текст');
});

test('slugifyAnchor: дедупликация (одинаковые заголовки получают -1, -2)', () => {
  // Это поведение extractOutline, не slugifyAnchor — проверяем косвенно ниже
  const items = extractOutline('# Title\n## Title\n## Title\n');
  assert.equal(items[0].anchor, 'title');
  assert.equal(items[1].anchor, 'title-1');
  assert.equal(items[2].anchor, 'title-2');
});

test('extractOutline: пустой markdown → пустой массив', () => {
  assert.deepEqual(extractOutline(''), []);
  assert.deepEqual(extractOutline(null), []);
  assert.deepEqual(extractOutline(undefined), []);
});

test('extractOutline: один заголовок', () => {
  const items = extractOutline('# Hello');
  assert.equal(items.length, 1);
  assert.equal(items[0].level, 1);
  assert.equal(items[0].text, 'Hello');
  assert.equal(items[0].anchor, 'hello');
  assert.equal(items[0].line, 1);
});

test('extractOutline: вложенные уровни', () => {
  const md = `# H1
## H2.1
## H2.2
### H3.1
#### H4.1
`;
  const items = extractOutline(md);
  assert.equal(items.length, 5);
  assert.equal(items[0].level, 1);
  assert.equal(items[1].level, 2);
  assert.equal(items[2].level, 2);
  assert.equal(items[3].level, 3);
  assert.equal(items[4].level, 4);
  assert.equal(items[3].text, 'H3.1');
});

test('extractOutline: закрытые/открытые ATX заголовки', () => {
  const md = `# Title 1
## Title 2 ##
### Title 3
#### Title 4 ####
`;
  const items = extractOutline(md);
  assert.equal(items.length, 4);
  assert.equal(items[1].text, 'Title 2');
  assert.equal(items[3].text, 'Title 4');
});

test('extractOutline: setext-стиль (===, ---) распознаётся как H1/H2', () => {
  const md = `Title
=====
Subtitle
-------
`;
  const items = extractOutline(md);
  assert.equal(items.length, 2);
  assert.equal(items[0].level, 1);
  assert.equal(items[0].text, 'Title');
  assert.equal(items[1].level, 2);
  assert.equal(items[1].text, 'Subtitle');
});

test('extractOutline: игнорирует # внутри кода и цитат', () => {
  const md = `# Real heading
\`\`\`
# not a heading
\`\`\`
> # also not
`;
  const items = extractOutline(md);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Real heading');
});

test('extractOutline: line указывает на 1-based номер строки', () => {
  const md = `paragraph 1
paragraph 2
# Heading on line 3
`;
  const items = extractOutline(md);
  assert.equal(items[0].line, 3);
});

test('extractOutline: anchor стабилен между вызовами для того же текста', () => {
  const md = '# Same\n# Same\n# Same';
  const a = extractOutline(md);
  const b = extractOutline(md);
  assert.deepEqual(a, b);
});

test('extractOutline: уровни ограничены 1-6', () => {
  const md = '####### Not a heading\n## Valid\n';
  const items = extractOutline(md);
  assert.equal(items.length, 1);
  assert.equal(items[0].level, 2);
});

test('extractOutline: frontmatter не создаёт ложных setext-заголовков', () => {
  // YAML frontmatter заканчивается `---` на отдельной строке — без
  // игнорирования этого блока Setext-детектор решит, что `tags: []`
  // это H2 (потому что следующая строка `---` подходит под `^-+$`).
  const md = `---
title: My Note
tags: []
category: Work
---

# Real heading

content`;
  const items = extractOutline(md);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Real heading');
});

test('withOccurrences: повторы одного текста нумеруются по порядку в документе', () => {
  const items = withOccurrences(extractOutline('## Summary\n## Details\n### Summary\n## Summary'));
  assert.deepEqual(items.map((it) => it.occurrence), [0, 0, 1, 2]);
});

test('findHeadingPos: берёт N-й заголовок с нужным текстом, а не первый', () => {
  const headings = [
    { text: 'Summary', pos: 10 },
    { text: 'Details', pos: 40 },
    { text: 'Summary', pos: 70 },
  ];
  assert.equal(findHeadingPos(headings, 'Summary', 0), 10);
  assert.equal(findHeadingPos(headings, 'Summary', 1), 70);
  assert.equal(findHeadingPos(headings, '  Summary  ', 1), 70);
});

test('findHeadingPos: нет такого заголовка или номера → null', () => {
  const headings = [{ text: 'Summary', pos: 10 }];
  assert.equal(findHeadingPos(headings, 'Summary', 1), null);
  assert.equal(findHeadingPos(headings, 'Missing'), null);
  assert.equal(findHeadingPos(headings, ''), null);
});

test('extractOutline: экранированный \\# внутри frontmatter распознаётся как heading', () => {
  // tiptap-markdown экранирует # у заголовков, чтобы не сломать YAML
  // (например, первая строка body после frontmatter часто экранируется)
  const md = `---
title: "My Note"
tags: []
---

\\# Real heading

content`;
  const items = extractOutline(md);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Real heading');
});

test('plainHeadingText: разметка заголовка не попадает в оглавление', () => {
  const cases = {
    '**Введение**': 'Введение',
    '***both***': 'both',
    '~~x~~ done': 'x done',
    '_it_ and __b__': 'it and b',
    'See [docs](https://a.b) now': 'See docs now',
    '![pic](a.png) cap': 'pic cap',
    'Use `**raw**` here': 'Use **raw** here',
    'snake_case_word': 'snake_case_word',
    '2 * 3 * 4': '2 * 3 * 4',
    '[[Wiki link]]': '[[Wiki link]]',
    '\\*not italic\\*': '*not italic*',
  };
  for (const [raw, expected] of Object.entries(cases)) assert.equal(plainHeadingText(raw), expected, raw);
});

test('extractOutline: заголовок в **жирном** выходит без звёздочек', () => {
  const [item] = extractOutline('## **Введение**\n');
  assert.equal(item.text, 'Введение');
  assert.equal(item.anchor, 'введение');
});

test('extractOutline: горизонтальная линия без frontmatter не прячет заголовки после неё', () => {
  const items = extractOutline('# A\n\ntext\n\n---\n\n## B\n\n---\n\n## C\n');
  assert.deepEqual(items.map((i) => i.text), ['A', 'B', 'C']);
});

test('extractOutline: настоящий frontmatter по-прежнему пропускается', () => {
  const items = extractOutline('---\ntitle: # not heading\n---\n\n# Real\n');
  assert.deepEqual(items.map((i) => i.text), ['Real']);
});

test('clampOutlineWidth: держит ширину колонки в пределах, мусор даёт значение по умолчанию', async () => {
  const { clampOutlineWidth, OUTLINE_WIDTH } = await import('./outline.js');
  assert.equal(clampOutlineWidth(10), OUTLINE_WIDTH.MIN);
  assert.equal(clampOutlineWidth(9999), OUTLINE_WIDTH.MAX);
  assert.equal(clampOutlineWidth('300.4'), 300);
  assert.equal(clampOutlineWidth('abc'), OUTLINE_WIDTH.DEFAULT);
  assert.equal(clampOutlineWidth(null), OUTLINE_WIDTH.DEFAULT);
});
