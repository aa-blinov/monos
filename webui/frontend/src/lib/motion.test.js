import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollBehavior } from './motion.js';

const withWindow = (win, fn) => {
  globalThis.window = win;
  try {
    return fn();
  } finally {
    delete globalThis.window;
  }
};

test('scrollBehavior: без window (сборка, тесты) — плавно', () => {
  assert.equal(scrollBehavior(), 'smooth');
});

test('scrollBehavior: без запроса меньше движения — плавно', () => {
  withWindow({ matchMedia: () => ({ matches: false }) }, () => {
    assert.equal(scrollBehavior(), 'smooth');
  });
});

test('scrollBehavior: при prefers-reduced-motion: reduce — сразу, без анимации', () => {
  withWindow({
    matchMedia: (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }),
  }, () => {
    assert.equal(scrollBehavior(), 'auto');
  });
});
