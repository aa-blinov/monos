import test from 'node:test';
import assert from 'node:assert/strict';
import { menuDangerClass, menuItemClass, menuPanelClass, menuSeparatorClass } from './menu-style.js';

test('a menu row is left aligned, sentence case and one size', () => {
  assert.match(menuItemClass, /\bjustify-start\b/);
  assert.match(menuItemClass, /\btext-sm\b/);
  assert.doesNotMatch(menuItemClass, /uppercase|tracking-(?!normal)|justify-center|text-center/);
  assert.match(menuItemClass, /!tracking-normal/);
  assert.match(menuItemClass, /max-sm:!min-h-11/, 'a touch target is 44px on a phone');
});

test('the panel and the separator use kit tokens, not literal colours', () => {
  for (const value of [menuPanelClass, menuSeparatorClass, menuItemClass, menuDangerClass]) {
    assert.doesNotMatch(value, /#[0-9a-f]{3,8}\b|rgb\(/i);
  }
  assert.match(menuPanelClass, /\bborder-line\b/);
  assert.match(menuPanelClass, /\bshadow-overlay\b/);
});

test('a destructive row keeps the shared geometry and only changes colour', () => {
  assert.match(menuDangerClass, /danger/);
  assert.doesNotMatch(menuDangerClass, /px-|py-|min-h|justify/);
});
