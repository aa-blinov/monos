import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertFrontmatter } from './frontmatter.js';
import { parseFrontmatterMetadata } from './search.js';

test('BOM сохраняется при переписывании шапки', () => {
  const note = '\uFEFF---\ntitle: "Старый"\n---\n\nТекст.\n';
  const next = upsertFrontmatter(note, { title: 'Новый', tags: [] });
  assert.ok(next.startsWith('\uFEFF'), 'BOM обязан остаться в начале файла');
});

test('CRLF-файл не получает смешанных переводов строк', () => {
  // QA-находка: перезапись переводила шапку на LF, оставляя тело на CRLF.
  // Git после этого считает файл полностью изменённым.
  const note = '---\r\ntitle: "Старый"\r\n---\r\n\r\nТело\r\n';
  const next = upsertFrontmatter(note, { title: 'Новый', tags: ['a'] });
  const withoutCrlf = next.replace(/\r\n/g, '');
  assert.ok(!withoutCrlf.includes('\n'), `найден голый LF в: ${JSON.stringify(next)}`);
  assert.ok(next.includes('Тело\r\n'), 'тело должно остаться на CRLF');
});

test('тело заметки не меняется', () => {
  const note = '---\ntitle: "A"\n---\n\nПервый абзац.\n\nВторой абзац.\n';
  const next = upsertFrontmatter(note, { title: 'B', tags: ['x'] });
  assert.ok(next.endsWith('Первый абзац.\n\nВторой абзац.\n'));
});

test('неизвестные ключи сохраняются', () => {
  const note = '---\ntitle: "A"\ncustom: значение\n---\n\nТело\n';
  const next = upsertFrontmatter(note, { title: 'B', tags: [] });
  assert.match(next, /custom: значение/);
});
test('закрепление пишется в шапку и читается обратно', () => {
  const note = '---\ntitle: "Задача"\n---\n\nТело\n';
  const pinned = upsertFrontmatter(note, { title: 'Задача', tags: [], pinned: true });
  assert.match(pinned, /^pinned: true$/m);
  assert.equal(parseFrontmatterMetadata(pinned).pinned, true);
});

test('снятие закрепления убирает ключ, а не оставляет "pinned: false"', () => {
  const pinned = '---\ntitle: "Задача"\npinned: true\n---\n\nТело\n';
  const cleared = upsertFrontmatter(pinned, { title: 'Задача', tags: [], pinned: false });
  assert.ok(!cleared.includes('pinned'), `ключ остался: ${cleared}`);
  assert.equal(parseFrontmatterMetadata(cleared).pinned, false);
});

test('закрепление не вытесняет чужие ключи шапки', () => {
  const note = '---\ntitle: "A"\ndue: 2026-10-20\ncustom: значение\n---\n\nТело\n';
  const pinned = upsertFrontmatter(note, { title: 'A', tags: [], pinned: true });
  assert.match(pinned, /due: 2026-10-20/);
  assert.match(pinned, /custom: значение/);
  assert.match(pinned, /pinned: true/);
});

test('парсер понимает закрепление в разных написаниях', () => {
  const read = (line) => parseFrontmatterMetadata(`---\n${line}\n---\n\nx\n`).pinned;
  assert.equal(read('pinned: true'), true);
  assert.equal(read('pinned: "true"'), true);
  assert.equal(read('pinned: yes'), true);
  assert.equal(read('pinned: false'), false);
  assert.equal(read('pinned: 0'), false);
  assert.equal(parseFrontmatterMetadata('без шапки').pinned, false);
});
