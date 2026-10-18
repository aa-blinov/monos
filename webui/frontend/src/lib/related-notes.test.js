import test from 'node:test';
import assert from 'node:assert/strict';
import { relatedRows } from './related-notes.js';

const graph = {
  nodes: [
    { path: 'me', title: 'Me', center: true, relation: 'self' },
    { path: 'z', title: 'Zeta', relation: 'in' },
    { path: 'a', title: 'Alpha', relation: 'out' },
    { path: 'b', title: 'Beta', relation: 'both' },
    { path: 'c', title: 'Charlie', relation: 'out' },
  ],
};

test('связанные заметки: сначала в обе стороны, потом отсюда, потом сюда; внутри по имени', () => {
  const rows = relatedRows(graph, []);
  assert.deepEqual(rows.map((row) => [row.name, row.relation]), [['Beta', 'both'], ['Alpha', 'out'], ['Charlie', 'out'], ['Zeta', 'in']]);
});

test('обратная ссылка, которую граф не показал, считается входящей; повторов нет', () => {
  const rows = relatedRows(graph, [{ path: 'z', name: 'Zeta' }, { path: 'far', name: 'Far away' }]);
  assert.equal(rows.filter((row) => row.path === 'z').length, 1);
  assert.deepEqual(rows.find((row) => row.path === 'far'), { path: 'far', name: 'Far away', relation: 'in' });
});

test('старый ответ без relation и пустые входы не ломают список', () => {
  assert.deepEqual(relatedRows({ nodes: [{ path: 'x', title: 'X' }] }, []).map((row) => row.relation), ['in']);
  assert.deepEqual(relatedRows(null, null), []);
  assert.deepEqual(relatedRows({ nodes: [{ path: 'me', title: 'Me', center: true }] }, []), []);
});
