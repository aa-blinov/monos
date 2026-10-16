import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectPinned,
  isPinned,
  markPinned,
  pinNote,
  unpinNote,
  setPinnedFromTree,
  migrateLegacyPins,
  pinnedNotes,
} from './sidebar-pinned.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push(`${options.method || 'GET'} ${url} ${options.body || ''}`);
  return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
};

const note = (path, pinned, title) => ({
  path,
  name: path.split('/').pop(),
  is_dir: false,
  metadata: { pinned, title: title || null, tags: [] },
});
const folder = (path, children) => ({ path, is_dir: true, children });

test('закреплённые собираются из дерева, а не из браузера', () => {
  const tree = folder('notes', [
    folder('notes/Заметки', [note('notes/Заметки/Одна.md', true), note('notes/Заметки/Две.md', false)]),
    note('notes/Корневая.md', true, 'Корневая'),
  ]);
  // Порядок дерева: папка обходится раньше заметки рядом с ней.
  assert.deepEqual(collectPinned(tree), [
    { path: 'notes/Заметки/Одна.md', name: 'Одна' },
    { path: 'notes/Корневая.md', name: 'Корневая' },
  ]);
});

test('в дереве без закреплений список пуст', () => {
  assert.deepEqual(collectPinned(folder('notes', [note('notes/a.md', false)])), []);
  assert.deepEqual(collectPinned(null), []);
});

test('isPinned отвечает по текущему списку', () => {
  setPinnedFromTree(folder('notes', [note('notes/да.md', true), note('notes/нет.md', false)]));
  assert.equal(isPinned('notes/да.md'), true);
  assert.equal(isPinned('notes/нет.md'), false);
});

test('закрепление пишется в файл заметки, а не в localStorage', async () => {
  calls.length = 0;
  store.clear();
  await pinNote('notes/Новая.md', 'Новая');
  assert.match(calls.at(-1), /PUT \/api\/file\/metadata\?path=notes%2F/);
  assert.match(calls.at(-1), /"pinned":true/);
  assert.equal(store.size, 0, 'в localStorage ничего не должно остаться');
  assert.equal(isPinned('notes/Новая.md'), true);
});

test('снятие закрепления убирает ключ, а не пишет false', async () => {
  calls.length = 0;
  setPinnedFromTree(folder('notes', [note('notes/Закреп.md', true)]));
  await unpinNote('notes/Закреп.md');
  assert.match(calls.at(-1), /"pinned":false/);
  assert.equal(isPinned('notes/Закреп.md'), false);
});

test('при отказе записи список не врёт', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => '{"detail":"nope"}' });
  setPinnedFromTree(folder('notes', [note('notes/Ошибка.md', false)]));
  await assert.rejects(() => pinNote('notes/Ошибка.md', 'Ошибка'));
  assert.equal(isPinned('notes/Ошибка.md'), false, 'незакреплённая заметка не должна выглядеть закреплённой');
  globalThis.fetch = original;
});

test('прежние закрепления из localStorage переезжают в заметки', async () => {
  store.clear();
  calls.length = 0;
  store.set('pinnedNotes', JSON.stringify([
    { path: 'notes/Старая-1.md', name: 'Старая-1' },
    { path: 'notes/Старая-2.md', name: 'Старая-2' },
  ]));

  const result = await migrateLegacyPins();
  assert.deepEqual(result.migrated, ['notes/Старая-1.md', 'notes/Старая-2.md']);
  assert.equal(result.skipped, 0);
  assert.equal(store.has('pinnedNotes'), false, 'старый ключ убирается только после успеха');
  assert.equal(calls.filter((call) => call.includes('"pinned":true')).length, 2);
});

test('прерванная миграция не теряет то, что не записала', async () => {
  store.clear();
  store.set('pinnedNotes', JSON.stringify([
    { path: 'notes/Пропала.md', name: 'Пропала' },
    { path: 'notes/Осталась.md', name: 'Осталась' },
  ]));
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (url, options = {}) => {
    call += 1;
    if (call === 1) return { ok: false, status: 404, text: async () => '{"detail":"нет такой заметки"}' };
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
  };

  const result = await migrateLegacyPins();
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.migrated, ['notes/Осталась.md']);
  assert.equal(store.has('pinnedNotes'), true, 'незавершённая миграция обязана оставить ключ, чтобы доделать позже');

  globalThis.fetch = original;
  // Повторный запуск добивает то, что не записалось в прошлый раз, и заново
  // пишет уже сделанное — повтор идемпотентен, потому что это `pinned: true`.
  const finished = await migrateLegacyPins();
  assert.ok(
    finished.migrated.includes('notes/Пропала.md'),
    'прерванная миграция должна дописать заметку, на которой упала',
  );
  assert.equal(finished.skipped, 0);
  assert.equal(store.has('pinnedNotes'), false);
});

test('без старых закреплений миграция ничего не трогает', async () => {
  store.clear();
  calls.length = 0;
  const result = await migrateLegacyPins();
  assert.deepEqual(result, { migrated: [], skipped: 0 });
  assert.equal(calls.length, 0);
});

test('испорченный ключ не роняет применение', async () => {
  store.clear();
  store.set('pinnedNotes', '{ это не json');
  const result = await migrateLegacyPins();
  assert.deepEqual(result, { migrated: [], skipped: 0 });
});

test('повторное закрепление не дублирует запись', async () => {
  calls.length = 0;
  setPinnedFromTree(folder('notes', [note('notes/раз.md', true)]));
  await pinNote('notes/раз.md', 'раз');
  assert.equal(get(pinnedNotes).filter((n) => n.path === 'notes/раз.md').length, 1);
});

function get(store) {
  let value;
  store.subscribe((current) => { value = current; })();
  return value;
}
test('markPinned сразу добавляет и убирает заметку в списке боковой панели', () => {
  pinnedNotes.set([]);
  markPinned('notes/Вторая.md', true, 'Вторая');
  assert.deepEqual(get(pinnedNotes).map((note) => note.path), ['notes/Вторая.md']);
  markPinned('notes/Вторая.md', true, 'Вторая');
  assert.equal(get(pinnedNotes).length, 1);
  markPinned('notes/Вторая.md', false);
  assert.equal(get(pinnedNotes).length, 0);
});
