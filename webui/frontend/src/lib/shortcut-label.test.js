import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutLabel } from './shortcut-label.js';

test('вне macOS подпись остаётся как написана', () => {
  assert.equal(shortcutLabel('Ctrl+K', false), 'Ctrl+K');
  assert.equal(shortcutLabel('Ctrl+Shift+F', false), 'Ctrl+Shift+F');
});

test('на macOS Ctrl становится ⌘, Shift становится ⇧', () => {
  assert.equal(shortcutLabel('Ctrl+K', true), '⌘K');
  assert.equal(shortcutLabel('Ctrl+Shift+F', true), '⌘⇧F');
  assert.equal(shortcutLabel('Ctrl+S', true), '⌘S');
});

test('пустое значение не падает', () => {
  assert.equal(shortcutLabel('', true), '');
  assert.equal(shortcutLabel(undefined, false), '');
});

test('detectPlatform называет систему, на которой открыта страница', async () => {
  const { detectPlatform } = await import('./shortcut-label.js');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const set = (platform) => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform, userAgent: '' } });
  try {
    set('MacIntel');
    assert.equal(detectPlatform(), 'mac');
    set('Win32');
    assert.equal(detectPlatform(), 'windows');
    set('Linux x86_64');
    assert.equal(detectPlatform(), 'linux');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
});
