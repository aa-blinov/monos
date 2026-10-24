import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardIsUp, watchKeyboard } from './keyboard-state.js';

test('the keyboard is up only with a focused field and a visible area that lost a keyboard of height', () => {
  assert.equal(keyboardIsUp({ layoutHeight: 844, visibleHeight: 500, editableFocused: true }), true);
  assert.equal(keyboardIsUp({ layoutHeight: 844, visibleHeight: 500, editableFocused: false }), false);
  assert.equal(keyboardIsUp({ layoutHeight: 844, visibleHeight: 800, editableFocused: true }), false);
});

test('the root is marked while the keyboard is up and cleared when it goes', () => {
  const listeners = {};
  const viewport = { height: 844, addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} };
  const attributes = new Set();
  const doc = {
    activeElement: { matches: () => true },
    documentElement: { setAttribute: (name) => attributes.add(name), removeAttribute: (name) => attributes.delete(name) },
    addEventListener() {},
    removeEventListener() {},
  };
  watchKeyboard({ innerHeight: 844, visualViewport: viewport }, doc);
  viewport.height = 480;
  listeners.resize();
  assert.equal(attributes.has('data-keyboard'), true);
  viewport.height = 844;
  listeners.resize();
  assert.equal(attributes.has('data-keyboard'), false);
});

test('a browser without a visual viewport is left alone', () => {
  assert.equal(typeof watchKeyboard({ innerHeight: 800 }, {}), 'function');
});
