import test from 'node:test';
import assert from 'node:assert/strict';
import { availableMenuHeight, computeContextMenuPosition } from './context-menu-position.js';

test('оставляет координаты как есть, когда меню помещается', () => {
  const result = computeContextMenuPosition({
    x: 100, y: 100, menuWidth: 200, menuHeight: 200,
    viewportWidth: 1024, viewportHeight: 800, margin: 4,
  });
  assert.deepEqual(result, { x: 100, y: 100, flippedX: false, flippedY: false });
});

test('флипает вверх, когда меню выходит за нижнюю границу viewport', () => {
  const result = computeContextMenuPosition({
    x: 100, y: 600, menuWidth: 200, menuHeight: 300,
    viewportWidth: 1024, viewportHeight: 800, margin: 4,
  });
  assert.equal(result.flippedY, true);
  assert.equal(result.flippedX, false);
  assert.equal(result.y, 300);
  assert.equal(result.x, 100);
});

test('флипает влево, когда меню выходит за правую границу viewport', () => {
  const result = computeContextMenuPosition({
    x: 900, y: 100, menuWidth: 200, menuHeight: 200,
    viewportWidth: 1024, viewportHeight: 800, margin: 4,
  });
  assert.equal(result.flippedX, true);
  assert.equal(result.flippedY, false);
  assert.equal(result.x, 700);
  assert.equal(result.y, 100);
});

test('флипает в обоих направлениях, когда меню выходит за обе границы', () => {
  const result = computeContextMenuPosition({
    x: 900, y: 600, menuWidth: 200, menuHeight: 300,
    viewportWidth: 1024, viewportHeight: 800, margin: 4,
  });
  assert.equal(result.flippedX, true);
  assert.equal(result.flippedY, true);
  assert.equal(result.x, 700);
  assert.equal(result.y, 300);
});

test('margin=0 зажимает координаты к 0, не уходит в минус', () => {
  const result = computeContextMenuPosition({
    x: -10, y: -10, menuWidth: 200, menuHeight: 200,
    viewportWidth: 1024, viewportHeight: 800, margin: 0,
  });
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
});

test('применяет margin=8 для отступа от края экрана', () => {
  const result = computeContextMenuPosition({
    x: 2, y: 100, menuWidth: 200, menuHeight: 200,
    viewportWidth: 1024, viewportHeight: 800, margin: 8,
  });
  assert.equal(result.x, 8);
  assert.equal(result.y, 100);
});

test('не флипает, когда с другой стороны тоже не помещается', () => {
  const result = computeContextMenuPosition({
    x: 100, y: 50, menuWidth: 200, menuHeight: 300,
    viewportWidth: 1024, viewportHeight: 200, margin: 4,
  });
  assert.equal(result.flippedY, false);
  assert.equal(result.y, 50);
});

test('зажимает координаты к margin, когда они уходят за левую/верхнюю границу', () => {
  const result = computeContextMenuPosition({
    x: -50, y: -50, menuWidth: 100, menuHeight: 100,
    viewportWidth: 800, viewportHeight: 600, margin: 4,
  });
  assert.equal(result.x, 4);
  assert.equal(result.y, 4);
});

test('обрабатывает нулевые размеры viewport без падения', () => {
  const result = computeContextMenuPosition({
    x: 0, y: 0, menuWidth: 100, menuHeight: 100,
    viewportWidth: 0, viewportHeight: 0, margin: 0,
  });
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.flippedX, false);
  assert.equal(result.flippedY, false);
});

test('воспроизводит баг из скриншота: ПКМ внизу списка, RENAME обрезается', () => {
  const result = computeContextMenuPosition({
    x: 250, y: 550, menuWidth: 192, menuHeight: 200,
    viewportWidth: 1280, viewportHeight: 720, margin: 4,
  });
  assert.equal(result.flippedY, true);
  assert.equal(result.y, 350);
  assert.equal(result.x, 250);
});

test('availableMenuHeight: меню доходит до низа окна с отступом и не становится крошечным', () => {
  assert.equal(availableMenuHeight({ top: 200, viewportHeight: 800 }), 592);
  assert.equal(availableMenuHeight({ top: 200, viewportHeight: 800, margin: 0 }), 600);
  assert.equal(availableMenuHeight({ top: 450, viewportHeight: 480 }), 120);
  assert.equal(availableMenuHeight({ top: 450, viewportHeight: 480, minHeight: 60 }), 60);
});
