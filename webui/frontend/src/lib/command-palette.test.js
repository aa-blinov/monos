import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { commandPaletteOpen, commandPaletteMode, openCommandPalette, closeCommandPalette } from './command-palette.js';

test.beforeEach(() => {
  commandPaletteOpen.set(false);
  commandPaletteMode.set('commands');
});

test('openCommandPalette открывает с дефолтным mode=commands', () => {
  openCommandPalette();
  assert.equal(get(commandPaletteOpen), true);
  assert.equal(get(commandPaletteMode), 'commands');
});

test('openCommandPalette устанавливает указанный mode', () => {
  openCommandPalette('notes');
  assert.equal(get(commandPaletteMode), 'notes');
});

test('closeCommandPalette закрывает, не трогая mode', () => {
  openCommandPalette('notes');
  closeCommandPalette();
  assert.equal(get(commandPaletteOpen), false);
  assert.equal(get(commandPaletteMode), 'notes');
});
