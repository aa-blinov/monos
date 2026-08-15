import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOutline, slugifyAnchor } from './outline.js';

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
