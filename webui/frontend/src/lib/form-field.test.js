import test from 'node:test';
import assert from 'node:assert/strict';
import { formFieldClass } from './form-field.js';

test('formFieldClass даёт одинаковый size для input и select', () => {
  const cls = formFieldClass();
  // text-sm для select, чтобы font-size совпадал с input
  assert.match(cls, /text-sm/, 'обязательно text-sm для одинакового font-size');
  // leading-6 — фиксированный line-height, иначе <select> и <input> рендерят
  // текст на разной базовой линии (заметно в Template Library, FOLDER vs TITLE).
  assert.match(cls, /leading-6/, 'обязательно leading-6 для одинакового baseline');
  // h-9, а не высота из отступа + межстрочного: производная давала 37px против
  // 36px на других экранах (лишний border-b), и поля выглядели разными.
  assert.match(cls, /h-9/, 'обязательно h-9: высота задаётся, а не складывается');
  assert.doesNotMatch(cls, /\bpy-/, 'вертикальный padding задал бы высоту поверх h-9');
  // border-b — общая стилистика underline
  assert.match(cls, /border-b/, 'обязательно border-b для подчёркивания');
});

test('formFieldClass использует CSS-переменные темы', () => {
  const cls = formFieldClass();
  assert.match(cls, /border-line/, 'border должен быть из border-subtle');
});

test('formFieldClass включает focus-стиль', () => {
  const cls = formFieldClass();
  assert.match(cls, /focus:border-ink-soft/, 'focus должен подсвечивать border');
  assert.match(cls, /outline-none/, 'фокусное кольцо должно быть отключено');
});

test('formFieldClass поддерживает extraClass для select (cursor-pointer, appearance-none)', () => {
  const cls = formFieldClass({ extraClass: 'appearance-none cursor-pointer' });
  assert.match(cls, /appearance-none/, 'extraClass должен примениться');
  assert.match(cls, /cursor-pointer/, 'extraClass должен примениться');
  // Базовые классы тоже остались
  assert.match(cls, /text-sm/);
  assert.match(cls, /leading-6/);
});

test('formFieldClass возвращает строку без двойных пробелов', () => {
  const cls = formFieldClass({ extraClass: 'appearance-none cursor-pointer' });
  assert.equal(typeof cls, 'string');
  assert.doesNotMatch(cls, /\s{2,}/);
});

test('formFieldClass без extraClass работает для обычного input', () => {
  const cls = formFieldClass();
  // Для input не нужны appearance-none/cursor-pointer — это нормально
  assert.doesNotMatch(cls, /appearance-none/, 'без extraClass не должно быть appearance-none');
});
