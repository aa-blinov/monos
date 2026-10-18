/**
 * The pure parts of the map of notes: who is whose neighbour, how far a note is from the one in focus, how big a
 * dot is, where the view should sit, what a click hit, and which labels are worth drawing. The drawing and the
 * layout itself are in NoteMap.svelte.
 */

/** @returns {Map<string, Set<string>>} each note with the notes it shares a link with, in either direction */
export function adjacency(edges) {
  const map = new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const edge of edges || []) {
    if (!edge || edge.from === edge.to) continue;
    add(edge.from, edge.to);
    add(edge.to, edge.from);
  }
  return map;
}

/** Steps from `start` to every note within `maxHops`; the start is 0. Notes farther away are not in the map. */
export function hopDistances(adj, start, maxHops = 2) {
  const distance = new Map();
  if (!start) return distance;
  distance.set(start, 0);
  let frontier = [start];
  for (let hop = 1; hop <= maxHops; hop += 1) {
    const next = [];
    for (const path of frontier) {
      for (const other of adj.get(path) || []) {
        if (distance.has(other)) continue;
        distance.set(other, hop);
        next.push(other);
      }
    }
    frontier = next;
  }
  return distance;
}

/** Dot radius in screen pixels: a hub is bigger, but never a blob. */
export function nodeRadius(degree) {
  return Math.min(11, 3.2 + Math.sqrt(Math.max(0, degree || 0)) * 1.5);
}

/**
 * How visible a note is. With a note in focus the notes around it stay clear and the rest fade; with a search
 * the matches stay clear; with the pointer on a note it and its neighbours stand out.
 */
export function noteOpacity({ path, distances, matches, hovered, adj }) {
  if (hovered) return hovered === path || adj.get(hovered)?.has(path) ? 1 : 0.14;
  if (matches) return matches.has(path) ? 1 : 0.14;
  if (distances && distances.size) {
    const hops = distances.get(path);
    return hops === undefined ? 0.12 : hops <= 1 ? 1 : 0.6;
  }
  return 1;
}

/**
 * The view (scale and offset) that puts `points` in the middle of a `width` x `height` canvas with `padding` around.
 * The world is centred on 0, 0; a screen point is `world * k + (x, y)`.
 */
export function fitView(points, width, height, { padding = 48, maxScale = 2.2, minScale = 0.05 } = {}) {
  if (!points || points.length === 0 || !(width > 0) || !(height > 0)) return { k: 1, x: width / 2 || 0, y: height / 2 || 0 };
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const k = Math.min(maxScale, Math.max(minScale, Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY)));
  return { k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k };
}

/** A view of scale `k` with the world point (wx, wy) in the middle of the canvas. */
export function centerOn(wx, wy, k, width, height) {
  return { k, x: width / 2 - wx * k, y: height / 2 - wy * k };
}

/** Zooms by `factor` around a screen point, keeping the world point under it where it is. */
export function zoomAt(view, factor, sx, sy, { min = 0.1, max = 5 } = {}) {
  const k = Math.min(max, Math.max(min, view.k * factor));
  const ratio = k / view.k;
  return { k, x: sx - (sx - view.x) * ratio, y: sy - (sy - view.y) * ratio };
}

/** The note under a screen point (nearest dot within its radius plus a finger's slack), or null. */
export function hitTest(nodes, view, sx, sy, slack = 4) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of nodes) {
    const dx = node.x * view.k + view.x - sx;
    const dy = node.y * view.k + view.y - sy;
    const distance = Math.hypot(dx, dy);
    const reach = nodeRadius(node.degree) + slack;
    if (distance <= reach && distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Whether a note's name is drawn. Hubs are named early, the rest as the view comes closer; a note the person is
 * pointing at, searching for or has in focus is always named.
 */
export function showsLabel({ degree, scale, emphasised }) {
  if (emphasised) return true;
  if (scale < 0.45) return false;
  const needed = scale >= 1.6 ? 0 : scale >= 1 ? 2 : scale >= 0.7 ? 5 : 9;
  return degree >= needed;
}

/** Notes whose title contains every word of the query (case and Unicode form do not matter). */
export function matchNotes(nodes, query) {
  const words = String(query || '').normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const found = new Set();
  for (const node of nodes) {
    const title = String(node.title || '').normalize('NFC').toLowerCase();
    if (words.every((word) => title.includes(word))) found.add(node.path);
  }
  return found;
}

/** Ticks of the layout to run before it is called settled: more notes need more, up to a ceiling. */
export function layoutTicks(nodeCount) {
  return Math.round(Math.min(380, 140 + Math.sqrt(Math.max(0, nodeCount)) * 5));
}

/**
 * Which labels fit. The candidates are `{ x, y, w, h, priority }`, x the middle of the text and y its top; the
 * ones with the highest priority are placed first and a label that would overlap one already placed is dropped,
 * so a hub keeps its name and the crowd around it does not smear into one line.
 */
export function placeLabels(candidates, { limit = 220, pad = 3 } = {}) {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const rects = [];
  const accepted = [];
  for (const item of sorted) {
    const x1 = item.x - item.w / 2 - pad;
    const x2 = item.x + item.w / 2 + pad;
    const y1 = item.y - pad;
    const y2 = item.y + item.h + pad;
    let clear = true;
    for (const r of rects) {
      if (x1 < r.x2 && x2 > r.x1 && y1 < r.y2 && y2 > r.y1) { clear = false; break; }
    }
    if (!clear) continue;
    rects.push({ x1, x2, y1, y2 });
    accepted.push(item);
    if (accepted.length >= limit) break;
  }
  return accepted;
}
