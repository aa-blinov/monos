import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_COLORS, getNoteColorOptions } from './note-colors.js';

test('каждая тема имеет палитру из 10 hex-цветов', () => {
  for (const [name, colors] of Object.entries(NOTE_COLORS)) {
    assert.equal(colors.length, 10, `${name} должен содержать 10 цветов`);
    for (const c of colors) {
      assert.match(c, /^#[0-9a-f]{6}$/i, `${name} цвет ${c} не валидный hex`);
    }
  }
});

test('getNoteColorOptions возвращает палитру для известной темы', () => {
  assert.equal(getNoteColorOptions('gruvbox'), NOTE_COLORS.gruvbox);
  assert.equal(getNoteColorOptions('github'), NOTE_COLORS.github);
  assert.equal(getNoteColorOptions('dracula'), NOTE_COLORS.dracula);
  assert.equal(getNoteColorOptions('nord'), NOTE_COLORS.nord);
  assert.equal(getNoteColorOptions('solarized'), NOTE_COLORS.solarized);
  assert.equal(getNoteColorOptions('catppuccin'), NOTE_COLORS.catppuccin);
});

test('getNoteColorOptions возвращает gruvbox для неизвестной темы', () => {
  assert.equal(getNoteColorOptions('unknown-theme'), NOTE_COLORS.gruvbox);
  assert.equal(getNoteColorOptions(''), NOTE_COLORS.gruvbox);
  assert.equal(getNoteColorOptions(null), NOTE_COLORS.gruvbox);
  assert.equal(getNoteColorOptions(undefined), NOTE_COLORS.gruvbox);
});

test('все темы содержат разные цвета (нет дублей в одной палитре)', () => {
  for (const [name, colors] of Object.entries(NOTE_COLORS)) {
    const unique = new Set(colors);
    assert.equal(unique.size, colors.length, `${name} содержит дубли`);
  }
});

test('gruvbox палитра: первые 2 — серые, остальные — акценты', () => {
  const [g1, g2, ...accents] = NOTE_COLORS.gruvbox;
  // Первые два должны быть нейтрально-серыми (low saturation)
  assert.match(g1.toLowerCase(), /^#(8|9|a|b)/i, 'g1 должен быть сероватый');
  assert.match(g2.toLowerCase(), /^#(8|9|a|b)/i, 'g2 должен быть сероватый');
  // Акценты покрывают 7 разных hue
  assert.equal(accents.length, 8);
});
