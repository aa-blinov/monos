/**
 * Places the local graph on a canvas: the note in the centre, its neighbours on a ring around it,
 * and the links between them as lines. The input is the answer of /api/notes/neighbors. Edges that
 * reach a note outside the answer are dropped, so the drawing never points at nothing.
 *
 * @param {{ nodes?: Array<{ path: string, title: string, center?: boolean }>, edges?: Array<{ from: string, to: string, both?: boolean }> } | null} graph
 * @param {{ width?: number, height?: number, labelRoom?: number }} [options]
 * @returns {{ nodes: Array<{ path: string, title: string, center: boolean, x: number, y: number }>, edges: Array<{ from: string, to: string, both: boolean, x1: number, y1: number, x2: number, y2: number }> }}
 */
export function layoutLocalGraph(graph, { width = 240, height = 180, labelRoom = 26 } = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const centre = nodes.find((node) => node.center) || nodes[0];
  if (!centre) return { nodes: [], edges: [] };

  const cx = width / 2;
  const cy = height / 2;
  const ring = nodes.filter((node) => node !== centre);
  const radius = Math.max(0, Math.min(width, height) / 2 - labelRoom);
  const placed = new Map([[centre.path, { path: centre.path, title: centre.title || '', center: true, x: cx, y: cy }]]);
  // Starts at the top and goes clockwise, so the same graph always draws the same way.
  ring.forEach((node, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / ring.length;
    placed.set(node.path, {
      path: node.path,
      title: node.title || '',
      center: false,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });

  const edges = (Array.isArray(graph.edges) ? graph.edges : [])
    .filter((edge) => edge.from !== edge.to && placed.has(edge.from) && placed.has(edge.to))
    .map((edge) => {
      const from = placed.get(edge.from);
      const to = placed.get(edge.to);
      return { from: edge.from, to: edge.to, both: Boolean(edge.both), x1: from.x, y1: from.y, x2: to.x, y2: to.y };
    });

  return { nodes: [...placed.values()], edges };
}

/** A label short enough for the canvas: the first `max` characters, and an ellipsis when cut. */
export function truncateLabel(text, max = 16) {
  const value = String(text || '').trim();
  const characters = [...value];
  return characters.length > max ? `${characters.slice(0, max - 1).join('')}…` : value;
}
