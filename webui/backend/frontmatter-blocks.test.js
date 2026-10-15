import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertFrontmatter } from './frontmatter.js';
import { parseFrontmatterMetadata } from './search.js';

test('блочный список тегов не остаётся строками под новым tags: при сохранении и не копится', () => {
  const original = '---\ntitle: X\ntags:\n  - a\n  - b\n---\n\nтекст\n';
  const saved = upsertFrontmatter(original, { title: 'X', tags: ['c'] });
  assert.equal(saved, '---\ntitle: "X"\ntags: ["c"]\n---\n\nтекст\n');
  assert.equal(upsertFrontmatter(saved, { title: 'X', tags: ['c'] }), saved);
});

test('ключи, которых модуль не трогает, сохраняются вместе со своими списками', () => {
  const original = '---\naliases:\n  - Первое\n  - Второе\nstatus: draft\n---\n\nтекст\n';
  const saved = upsertFrontmatter(original, { title: '', tags: [] });
  assert.equal(saved, '---\ntags: []\naliases:\n  - Первое\n  - Второе\nstatus: draft\n---\n\nтекст\n');
  assert.deepEqual(parseFrontmatterMetadata(saved).aliases, ['Первое', 'Второе']);
});

test('шапка с BOM сохраняется один раз: повторное сохранение не дописывает вторую шапку', () => {
  const original = '﻿---\ntitle: A\n---\n\nтекст\n';
  const once = upsertFrontmatter(original, { title: 'B', tags: [] });
  assert.equal(once.startsWith('﻿---\n'), true);
  assert.equal(once.split('title:').length - 1, 1);
  assert.equal(upsertFrontmatter(once, { title: 'B', tags: [] }), once);
});
