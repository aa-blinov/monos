import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutLocalGraph, truncateLabel } from './local-graph.js';

test('центр заметки стоит в середине, соседи лежат на кольце вокруг него', () => {
  const layout = layoutLocalGraph({
    nodes: [
      { path: 'a.md', title: 'A', center: true },
      { path: 'b.md', title: 'B' },
      { path: 'c.md', title: 'C' },
    ],
    edges: [],
  }, { width: 200, height: 200, labelRoom: 20 });

  const centre = layout.nodes.find((node) => node.path === 'a.md');
  assert.deepEqual([centre.center, centre.x, centre.y], [true, 100, 100]);
  const first = layout.nodes.find((node) => node.path === 'b.md');
  // The first neighbour starts at the top of the ring and the radius leaves room for labels.
  assert.ok(Math.abs(first.x - 100) < 1e-9);
  assert.ok(Math.abs(first.y - 20) < 1e-9);
  for (const node of layout.nodes.filter((item) => !item.center)) {
    assert.ok(Math.abs(Math.hypot(node.x - 100, node.y - 100) - 80) < 1e-9);
  }
});

test('связи соединяют точки узлов, связи к неизвестным заметкам отбрасываются', () => {
  const layout = layoutLocalGraph({
    nodes: [{ path: 'a.md', title: 'A', center: true }, { path: 'b.md', title: 'B' }],
    edges: [
      { from: 'a.md', to: 'b.md', both: true },
      { from: 'a.md', to: 'gone.md' },
      { from: 'b.md', to: 'b.md' },
    ],
  });
  assert.equal(layout.edges.length, 1);
  assert.equal(layout.edges[0].both, true);
  assert.equal(layout.edges[0].x1, layout.nodes[0].x);
  assert.equal(layout.edges[0].y2, layout.nodes.find((node) => node.path === 'b.md').y);
});

test('пустой или неполный граф не падает', () => {
  assert.deepEqual(layoutLocalGraph(null), { nodes: [], edges: [] });
  assert.deepEqual(layoutLocalGraph({ nodes: [] }), { nodes: [], edges: [] });
  const alone = layoutLocalGraph({ nodes: [{ path: 'a.md', title: 'A', center: true }] });
  assert.equal(alone.nodes.length, 1);
  assert.deepEqual(alone.edges, []);
});

test('truncateLabel обрезает длинное название многоточием и не режет символы пополам', () => {
  assert.equal(truncateLabel('Короткое'), 'Короткое');
  assert.equal(truncateLabel('Очень длинное название заметки', 10), 'Очень дли…');
  assert.equal(truncateLabel('😀😀😀😀', 3), '😀😀…');
});
