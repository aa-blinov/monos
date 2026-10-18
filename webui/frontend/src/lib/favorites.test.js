import test from 'node:test';
import assert from 'node:assert/strict';
import { isFavoriteProperties } from './favorites.js';

test('isFavoriteProperties: отметка — свойство favorite со значением true', () => {
  assert.equal(isFavoriteProperties([{ key: 'monos-favorite', type: 'checkbox', value: true }]), true);
  assert.equal(isFavoriteProperties([{ key: 'Monos-Favorite', type: 'checkbox', value: true }]), true);
  assert.equal(isFavoriteProperties([{ key: 'monos-favorite', type: 'checkbox', value: false }]), false);
  assert.equal(isFavoriteProperties([{ key: 'status', type: 'text', value: 'true' }]), false);
  // A person's own `favorite` property is not the mark.
  assert.equal(isFavoriteProperties([{ key: 'favorite', type: 'checkbox', value: true }]), false);
  assert.equal(isFavoriteProperties(undefined), false);
});
