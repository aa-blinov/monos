import test from 'node:test';
import assert from 'node:assert/strict';
import { TREE_NOTE_PATHS_DRAG_TYPE, writeNoteDragPayload, readNoteDragPayload } from './drag-payload.js';

// The drop side is a DOM API, so a stand-in that only records what was written is enough.
function fakeTransfer(initial = {}) {
  const store = { ...initial };
  return {
    effectAllowed: '',
    setData(type, value) { store[type] = String(value); },
    getData(type) { return store[type] ?? ''; },
    store,
  };
}

test('TREE_NOTE_PATHS_DRAG_TYPE — стабильная константа для контракта перетаскивания', () => {
  assert.equal(TREE_NOTE_PATHS_DRAG_TYPE, 'application/x-monos-note-paths');
});

test('writeNoteDragPayload кладёт первый путь в text/plain и весь список в тип', () => {
  const transfer = fakeTransfer();
  writeNoteDragPayload(transfer, ['notes/A.md', 'notes/B.md']);

  assert.equal(transfer.store['text/plain'], 'notes/A.md');
  assert.deepEqual(JSON.parse(transfer.store[TREE_NOTE_PATHS_DRAG_TYPE]), ['notes/A.md', 'notes/B.md']);
  assert.equal(transfer.effectAllowed, 'copyMove');
});

test('writeNoteDragPayload убирает повторы и пустые пути, иначе перенос схлопнется', () => {
  const transfer = fakeTransfer();
  writeNoteDragPayload(transfer, ['notes/A.md', '', 'notes/A.md', null, 'notes/B.md']);

  assert.deepEqual(JSON.parse(transfer.store[TREE_NOTE_PATHS_DRAG_TYPE]), ['notes/A.md', 'notes/B.md']);
});

test('writeNoteDragPayload с пустым списком не пишет ничего и не ставит effectAllowed', () => {
  const transfer = fakeTransfer();
  writeNoteDragPayload(transfer, []);

  assert.deepEqual(transfer.store, {});
  assert.equal(transfer.effectAllowed, '');
});

test('writeNoteDragPayload принимает effectAllowed: папка двигается, заметка копируется', () => {
  const transfer = fakeTransfer();
  writeNoteDragPayload(transfer, ['notes/Folder'], 'move');
  assert.equal(transfer.effectAllowed, 'move');
});

test('readNoteDragPayload читает список, а не только первый путь', () => {
  const transfer = fakeTransfer();
  writeNoteDragPayload(transfer, ['notes/A.md', 'notes/B.md']);

  assert.deepEqual(readNoteDragPayload(transfer, 'ignored'), ['notes/A.md', 'notes/B.md']);
});

test('readNoteDragPayload падает на старый payload только с text/plain, а не теряет перенос', () => {
  const transfer = fakeTransfer({ 'text/plain': 'notes/Legacy.md' });

  assert.deepEqual(readNoteDragPayload(transfer, 'notes/Legacy.md'), ['notes/Legacy.md']);
});

test('readNoteDragPayload не падает на битом JSON', () => {
  const transfer = fakeTransfer({ [TREE_NOTE_PATHS_DRAG_TYPE]: 'not json' });

  assert.deepEqual(readNoteDragPayload(transfer, 'notes/Fallback.md'), ['notes/Fallback.md']);
});

test('readNoteDragPayload на перетаскивании не нашего отдаёт пустой список', () => {
  const transfer = fakeTransfer({ 'text/plain': 'https://example.com' });

  assert.deepEqual(readNoteDragPayload(transfer, 'https://example.com'), ['https://example.com']);
  assert.deepEqual(readNoteDragPayload(transfer, ''), []);
});

test('круг: записали — прочитали то же самое', () => {
  const paths = ['notes/One.md', 'notes/Two.md', 'notes/Three.md'];
  const transfer = fakeTransfer();
  writeNoteDragPayload(transfer, paths);

  assert.deepEqual(readNoteDragPayload(transfer, transfer.getData('text/plain')), paths);
});