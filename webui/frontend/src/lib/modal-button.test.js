import test from 'node:test';
import assert from 'node:assert/strict';
import { getModalButtonClass } from './modal-button.js';

test('primary и secondary используют одинаковый size/case/tracking', () => {
  const primary = getModalButtonClass('primary');
  const secondary = getModalButtonClass('secondary');
  // Оба должны иметь uppercase + tracking-widest, чтобы кнопки выравнивались визуально
  assert.match(primary, /uppercase/, 'primary должен быть uppercase');
  assert.match(primary, /tracking-widest/, 'primary должен иметь tracking-widest');
  assert.match(secondary, /uppercase/, 'secondary должен быть uppercase');
  assert.match(secondary, /tracking-widest/, 'secondary должен иметь tracking-widest');
  // Оба flex-1 одинаковой ширины
  assert.match(primary, /flex-1/, 'primary должен занимать flex-1');
  assert.match(secondary, /flex-1/, 'secondary должен занимать flex-1');
  // Оба text-sm
  assert.match(primary, /text-sm/, 'primary должен быть text-sm');
  assert.match(secondary, /text-sm/, 'secondary должен быть text-sm');
});

test('primary визуально сильнее secondary', () => {
  const primary = getModalButtonClass('primary');
  const secondary = getModalButtonClass('secondary');
  // primary — жирный, в цвете text-primary
  assert.match(primary, /font-bold/, 'primary должен быть font-bold');
  assert.match(primary, /text-\[var\(--text-primary\)\]/, 'primary должен быть в цвете text-primary');
  // secondary — обычный, в цвете text-secondary
  assert.match(secondary, /font-normal/, 'secondary должен быть font-normal (не font-medium)');
  assert.match(secondary, /text-\[var\(--text-secondary\)\]/, 'secondary должен быть в цвете text-secondary');
});

test('secondary не должен быть font-bold и не должен быть font-medium', () => {
  const secondary = getModalButtonClass('secondary');
  assert.doesNotMatch(secondary, /font-bold/, 'secondary не должен быть font-bold');
  assert.doesNotMatch(secondary, /font-medium/, 'secondary не должен быть font-medium (только normal или light)');
});

test('disabled состояние добавляет opacity-30 и cursor-not-allowed', () => {
  const primaryDisabled = getModalButtonClass('primary', { disabled: true });
  const secondaryDisabled = getModalButtonClass('secondary', { disabled: true });
  assert.match(primaryDisabled, /disabled:opacity-30/, 'primary disabled должен иметь opacity-30');
  assert.match(primaryDisabled, /disabled:cursor-not-allowed/, 'primary disabled должен иметь cursor-not-allowed');
  assert.match(secondaryDisabled, /disabled:opacity-30/, 'secondary disabled должен иметь opacity-30');
  assert.match(secondaryDisabled, /disabled:cursor-not-allowed/, 'secondary disabled должен иметь cursor-not-allowed');
});

test('включенное состояние без disabled по умолчанию', () => {
  const primary = getModalButtonClass('primary');
  const secondary = getModalButtonClass('secondary');
  // Даже в enabled состоянии класс disabled:opacity-30 присутствует — это CSS-вариант,
  // он применяется только когда <button disabled>. Главное — кнопка не имеет других
  // opacity-классов, которые бы перекрывали normal состояние.
  assert.doesNotMatch(primary, /opacity-50|opacity-40|opacity-60\b/, 'primary не должен иметь нетипичные opacity классы');
});

test('результат — строка без лишних пробелов', () => {
  const primary = getModalButtonClass('primary');
  const secondary = getModalButtonClass('secondary');
  assert.equal(typeof primary, 'string');
  assert.equal(typeof secondary, 'string');
  assert.doesNotMatch(primary, /\s{2,}/, 'primary не должен содержать двойных пробелов');
  assert.doesNotMatch(secondary, /\s{2,}/, 'secondary не должен содержать двойных пробелов');
  assert.ok(primary.trim().length > 0, 'primary не пустой');
  assert.ok(secondary.trim().length > 0, 'secondary не пустой');
});

test('hover состояние присутствует на обоих вариантах', () => {
  const primary = getModalButtonClass('primary');
  const secondary = getModalButtonClass('secondary');
  assert.match(primary, /hover:/, 'primary должен иметь hover состояние');
  assert.match(secondary, /hover:/, 'secondary должен иметь hover состояние');
});

test('оба варианта имеют transition для плавности', () => {
  const primary = getModalButtonClass('primary');
  const secondary = getModalButtonClass('secondary');
  assert.match(primary, /transition/, 'primary должен иметь transition');
  assert.match(secondary, /transition/, 'secondary должен иметь transition');
});

test('primary поддерживает extraClass для специальных вариантов (например, red-500 для Delete)', () => {
  const destroy = getModalButtonClass('primary', { extraClass: 'text-red-500' });
  assert.match(destroy, /text-red-500/, 'primary должен принять text-red-500');
  assert.match(destroy, /font-bold/, 'primary всё ещё font-bold');
  assert.match(destroy, /uppercase/, 'primary всё ещё uppercase');
});

test('secondary поддерживает extraClass', () => {
  const cancel = getModalButtonClass('secondary', { extraClass: 'py-2' });
  assert.match(cancel, /py-2/, 'secondary должен принять py-2');
  assert.match(cancel, /font-normal/, 'secondary всё ещё font-normal');
});
