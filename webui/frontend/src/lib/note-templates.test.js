import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noteTemplates,
  getLocalizedTemplates,
  getTemplateById,
  getTemplateContext,
  buildTemplateContent,
} from './note-templates.js';

test('noteTemplates — непустой массив', () => {
  assert.ok(Array.isArray(noteTemplates));
  assert.ok(noteTemplates.length >= 10, 'должно быть много встроенных шаблонов');
});

test('каждый шаблон имеет id, title, group, content', () => {
  for (const t of noteTemplates) {
    assert.ok(t.id, `шаблон без id: ${JSON.stringify(t)}`);
    assert.ok(t.title, `шаблон ${t.id} без title`);
    assert.ok(t.group, `шаблон ${t.id} без group`);
    assert.equal(typeof t.content, 'function', `шаблон ${t.id} content должен быть функцией`);
  }
});

test('getLocalizedTemplates возвращает массив', () => {
  const list = getLocalizedTemplates('en');
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0);
});

test('getTemplateById находит известный шаблон', () => {
  const t = getTemplateById('daily-note');
  assert.ok(t);
  assert.equal(t.id, 'daily-note');
});

test('getTemplateById для неизвестного возвращает первый шаблон (fallback)', () => {
  // контракт: не падает, а возвращает хоть что-то разумное
  const t = getTemplateById('does-not-exist');
  assert.ok(t);
  assert.ok(t.id);
});

test('getTemplateContext возвращает isoDate и time', () => {
  const ctx = getTemplateContext('My Title', new Date(2026, 0, 15, 14, 30, 45));
  assert.equal(ctx.title, 'My Title');
  assert.match(ctx.isoDate, /2026-01-15/);
  assert.match(ctx.time, /14:30/);
});

test('buildTemplateContent для daily-note возвращает Markdown с датой', () => {
  const t = getTemplateById('daily-note');
  const md = buildTemplateContent(t, 'My Day', new Date(2026, 0, 15, 14, 30, 45));
  assert.match(md, /Date: 2026-01-15/);
  assert.match(md, /Started: 14:30/);
  assert.match(md, /## Focus/);
});
