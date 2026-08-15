import test from 'node:test';
import assert from 'node:assert/strict';
import { iconOptions } from './icons.js';

test('iconOptions — массив непустых строк-имён lucide иконок', () => {
  assert.ok(Array.isArray(iconOptions));
  assert.ok(iconOptions.length > 10);
  for (const name of iconOptions) {
    assert.equal(typeof name, 'string');
    assert.ok(name.length > 0);
    // lucide имена — kebab-case
    assert.match(name, /^[a-z][a-z0-9-]*$/, `${name} не похоже на lucide icon name`);
  }
});

test('iconOptions содержит базовые иконки (folder, file-text, archive)', () => {
  assert.ok(iconOptions.includes('folder'));
  assert.ok(iconOptions.includes('file-text'));
  assert.ok(iconOptions.includes('archive'));
});
