/**
 * The rows of a note's Related panel: every note it is linked with, and in which direction. The local graph says
 * it for the notes it shows (`out`: this note links to it, `in`: it links here, `both`); a backlink the graph left
 * out for lack of room is an `in`. Two-way links come first, then the notes this one links to, then the ones that
 * link here; by name within each.
 */
const ORDER = { both: 0, out: 1, in: 2 };

/**
 * @param {{ nodes?: Array<{ path: string, title: string, center?: boolean, relation?: string }> } | null} graph
 * @param {Array<{ path: string, name: string }>} backlinks
 * @returns {Array<{ path: string, name: string, relation: 'both' | 'out' | 'in' }>}
 */
export function relatedRows(graph, backlinks) {
  const rows = new Map();
  for (const node of graph?.nodes || []) {
    if (node.center) continue;
    rows.set(node.path, { path: node.path, name: node.title, relation: ORDER[node.relation] === undefined ? 'in' : node.relation });
  }
  for (const item of backlinks || []) {
    if (!rows.has(item.path)) rows.set(item.path, { path: item.path, name: item.name, relation: 'in' });
  }
  return [...rows.values()].sort((a, b) => ORDER[a.relation] - ORDER[b.relation] || a.name.localeCompare(b.name));
}
