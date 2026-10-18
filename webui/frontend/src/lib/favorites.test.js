import test from 'node:test';
import assert from 'node:assert/strict';
import { isFavoriteProperties } from './favorites.js';

test('isFavoriteProperties: отметка — свойство favorite со значением true', () => {
  assert.equal(isFavoriteProperties([{ key: 'favorite', type: 'checkbox', value: true }]), true);
  assert.equal(isFavoriteProperties([{ key: 'Favorite', type: 'checkbox', value: true }]), true);
  assert.equal(isFavoriteProperties([{ key: 'favorite', type: 'checkbox', value: false }]), false);
  assert.equal(isFavoriteProperties([{ key: 'status', type: 'text', value: 'true' }]), false);
  assert.equal(isFavoriteProperties(undefined), false);
});
