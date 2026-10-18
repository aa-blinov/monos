import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacency, centerOn, placeLabels, fitView, hitTest, hopDistances, layoutTicks, matchNotes, noteOpacity, nodeRadius, showsLabel, zoomAt } from './note-map.js';

const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'x', to: 'y' }];

test('соседство не зависит от направления ссылки', () => {
  const adj = adjacency(edges);
  assert.deepEqual([...adj.get('b')].sort(), ['a', 'c']);
  assert.deepEqual([...adj.get('d')], ['c']);
  assert.equal(adjacency([{ from: 'a', to: 'a' }]).size, 0);
  assert.equal(adjacency(null).size, 0);
});

test('расстояние в шагах от заметки в фокусе, дальше предела заметок нет', () => {
  const adj = adjacency(edges);
  const distances = hopDistances(adj, 'a', 2);
  assert.deepEqual([...distances.entries()], [['a', 0], ['b', 1], ['c', 2]]);
  assert.equal(distances.has('d'), false);
  assert.equal(hopDistances(adj, 'x', 5).get('y'), 1);
  assert.equal(hopDistances(adj, '', 2).size, 0);
});

test('радиус растёт с числом связей, но ограничен', () => {
  assert.ok(nodeRadius(0) < nodeRadius(4));
  assert.ok(nodeRadius(4) < nodeRadius(25));
  assert.equal(nodeRadius(100000), 11);
  assert.ok(nodeRadius(undefined) > 0);
});

test('прозрачность: наведённая заметка и соседи яркие, поиск оставляет совпадения, фокус гасит дальних', () => {
  const adj = adjacency(edges);
  assert.equal(noteOpacity({ path: 'b', hovered: 'a', adj }), 1);
  assert.equal(noteOpacity({ path: 'a', hovered: 'a', adj }), 1);
  assert.equal(noteOpacity({ path: 'c', hovered: 'a', adj }), 0.14);
  assert.equal(noteOpacity({ path: 'c', matches: new Set(['c']), adj }), 1);
  assert.equal(noteOpacity({ path: 'a', matches: new Set(['c']), adj }), 0.14);
  const distances = hopDistances(adj, 'a', 2);
  assert.equal(noteOpacity({ path: 'b', distances, adj }), 1);
  assert.equal(noteOpacity({ path: 'c', distances, adj }), 0.6);
  assert.equal(noteOpacity({ path: 'd', distances, adj }), 0.12);
  assert.equal(noteOpacity({ path: 'd', adj }), 1);
});

test('подгонка: заметки оказываются по центру и помещаются', () => {
  const points = [{ x: -100, y: -50 }, { x: 100, y: 50 }];
  const view = fitView(points, 800, 600, { padding: 40 });
  for (const point of points) {
    const sx = point.x * view.k + view.x;
    const sy = point.y * view.k + view.y;
    assert.ok(sx >= 40 && sx <= 760 && sy >= 40 && sy <= 560, `${sx},${sy}`);
  }
  assert.equal(Math.round(((-100 * view.k + view.x) + (100 * view.k + view.x)) / 2), 400);
  assert.equal(fitView([], 800, 600).x, 400);
  assert.ok(fitView([{ x: 0, y: 0 }], 800, 600).k <= 2.2);
  assert.deepEqual(centerOn(10, 20, 2, 400, 300), { k: 2, x: 180, y: 110 });
});

test('масштаб вокруг точки оставляет эту точку на месте и не выходит за пределы', () => {
  const view = { k: 1, x: 100, y: 50 };
  const next = zoomAt(view, 2, 300, 200);
  assert.equal(next.k, 2);
  assert.equal((300 - view.x) / view.k, (300 - next.x) / next.k);
  assert.equal((200 - view.y) / view.k, (200 - next.y) / next.k);
  assert.equal(zoomAt(view, 1000, 0, 0).k, 5);
  assert.equal(zoomAt(view, 0.00001, 0, 0).k, 0.1);
});

test('нажатие попадает в ближайшую заметку с запасом под палец', () => {
  const nodes = [{ path: 'a', x: 0, y: 0, degree: 3 }, { path: 'b', x: 20, y: 0, degree: 3 }];
  const view = { k: 1, x: 100, y: 100 };
  assert.equal(hitTest(nodes, view, 101, 100)?.path, 'a');
  assert.equal(hitTest(nodes, view, 118, 100)?.path, 'b');
  assert.equal(hitTest(nodes, view, 300, 300), null);
  assert.equal(hitTest(nodes, view, 108, 100, 10)?.path, 'a');
});

test('подписи: хабы раньше, при приближении все, выделенной всегда', () => {
  assert.equal(showsLabel({ degree: 50, scale: 0.3 }), false);
  assert.equal(showsLabel({ degree: 50, scale: 0.3, emphasised: true }), true);
  assert.equal(showsLabel({ degree: 10, scale: 0.5 }), true);
  assert.equal(showsLabel({ degree: 3, scale: 0.5 }), false);
  assert.equal(showsLabel({ degree: 3, scale: 1.2 }), true);
  assert.equal(showsLabel({ degree: 0, scale: 2 }), true);
});

test('поиск по названию: все слова, регистр и форма Unicode не важны', () => {
  const nodes = [{ path: 'p1', title: 'Встреча с Аней' }, { path: 'p2', title: 'Встреча' }, { path: 'p3', title: 'Café notes' }];
  assert.deepEqual([...matchNotes(nodes, 'встреча аней')], ['p1']);
  assert.deepEqual([...matchNotes(nodes, 'ВСТРЕЧА')].sort(), ['p1', 'p2']);
  assert.deepEqual([...matchNotes(nodes, 'café')], ['p3']);
  assert.equal(matchNotes(nodes, '  '), null);
  assert.equal(matchNotes(nodes, null), null);
});

test('шагов раскладки больше для больших карт, но не бесконечно', () => {
  assert.ok(layoutTicks(10) < layoutTicks(2000));
  assert.equal(layoutTicks(1e9), 380);
  assert.ok(layoutTicks(0) >= 140);
});

test('подписи: важные остаются, перекрывающие их отбрасываются, лимит соблюдается', () => {
  const near = [
    { id: 'hub', x: 100, y: 100, w: 60, h: 14, priority: 9 },
    { id: 'tight', x: 110, y: 104, w: 60, h: 14, priority: 3 },
    { id: 'far', x: 300, y: 100, w: 60, h: 14, priority: 1 },
    { id: 'below', x: 100, y: 130, w: 60, h: 14, priority: 2 },
  ];
  assert.deepEqual(placeLabels(near).map((item) => item.id), ['hub', 'below', 'far']);
  assert.deepEqual(placeLabels(near, { limit: 1 }).map((item) => item.id), ['hub']);
  // The one the person points at (a huge priority) wins over a hub.
  const pointed = [{ id: 'hub', x: 0, y: 0, w: 40, h: 14, priority: 50 }, { id: 'pointed', x: 5, y: 2, w: 40, h: 14, priority: 1e6 }];
  assert.deepEqual(placeLabels(pointed).map((item) => item.id), ['pointed']);
  assert.deepEqual(placeLabels([]), []);
});
