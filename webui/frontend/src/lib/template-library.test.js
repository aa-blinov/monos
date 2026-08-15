import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTemplateCatalog,
  getTemplateCatalogById,
  getLibraryTemplatesForManagement,
  customTemplateToRuntime,
} from './template-library.js';

const HIDDEN = new Set(['zettel']);
const CUSTOM = [
  {
    id: 'custom-1',
    title: 'My Custom',
    description: 'Custom template for testing',
    category: 'Custom',
    tags: ['custom'],
    content: '# My Custom\n\nHello',
  },
];

test('getTemplateCatalog возвращает каталог (встроенные + custom, без скрытых)', () => {
  const catalog = getTemplateCatalog('en', HIDDEN, CUSTOM);
  assert.ok(Array.isArray(catalog));
  // скрытый шаблон отсутствует
  assert.ok(!catalog.some((t) => t.id === 'zettel'));
  // custom присутствует
  assert.ok(catalog.some((t) => t.id === 'custom-1'));
  // встроенные присутствуют
  assert.ok(catalog.some((t) => t.id === 'daily-note'));
});

test('getTemplateCatalogById находит шаблон', () => {
  const t = getTemplateCatalogById('daily-note', 'en', HIDDEN, CUSTOM);
  assert.ok(t);
  assert.equal(t.id, 'daily-note');
});

test('getTemplateCatalogById возвращает fallback (первый шаблон) для скрытого', () => {
  // контракт: не возвращает null, а даёт первый доступный
  const t = getTemplateCatalogById('zettel', 'en', HIDDEN, CUSTOM);
  assert.ok(t);
  assert.notEqual(t.id, 'zettel'); // скрытый не вернулся
});

test('getTemplateCatalogById возвращает fallback (первый шаблон) для несуществующего', () => {
  const t = getTemplateCatalogById('not-a-template', 'en', HIDDEN, CUSTOM);
  assert.ok(t);
  assert.ok(t.id);
});

test('getLibraryTemplatesForManagement возвращает все встроенные включая скрытые', () => {
  const all = getLibraryTemplatesForManagement('en', HIDDEN);
  assert.ok(all.some((t) => t.id === 'zettel')); // скрытый встроенный
});

test('customTemplateToRuntime создаёт runtime-совместимый шаблон', () => {
  const custom = {
    id: 'c1',
    title: 'Custom',
    description: 'd',
    category: 'C',
    tags: ['t'],
    content: '# {{title}}\n\nbody',
  };
  const runtime = customTemplateToRuntime(custom);
  assert.equal(runtime.id, 'c1');
  assert.equal(runtime.source, 'custom');
  assert.equal(typeof runtime.content, 'function');
  // {{title}} подставляется в рендере
  const rendered = runtime.content({ title: 'My Title', isoDate: '2026-01-01', shortDate: '2026-01-01', time: '10:00' });
  assert.match(rendered, /My Title/);
});
