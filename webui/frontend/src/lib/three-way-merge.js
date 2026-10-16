/**
 * Combine two edits of one note made from the same starting text, line by line (the diff3 rule).
 *
 * Used when a save is refused because a sync changed the note while it was open: the starting text is what
 * the editor loaded, "ours" is what is in the editor now, "theirs" is what the sync wrote. A part only one
 * side changed takes that change; a part both changed the same way is taken once; a part both changed
 * differently becomes a conflict, written with the usual markers so the note opens in the conflict view.
 */

/** Pairs of equal lines `[i, j]` in a longest common subsequence of `a` and `b`. */
function commonLines(a, b) {
  const n = a.length;
  const m = b.length;
  // Equal lines at both ends need no table; past a few million cells the middle is treated as one change.
  let head = 0;
  while (head < n && head < m && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < n - head && tail < m - head && a[n - 1 - tail] === b[m - 1 - tail]) tail += 1;
  const pairs = [];
  for (let k = 0; k < head; k += 1) pairs.push([k, k]);
  const rows = n - head - tail;
  const cols = m - head - tail;
  if (rows > 0 && cols > 0 && rows * cols <= 4_000_000) {
    const width = cols + 1;
    const table = new Uint32Array((rows + 1) * width);
    for (let i = rows - 1; i >= 0; i -= 1) {
      for (let j = cols - 1; j >= 0; j -= 1) {
        table[i * width + j] = a[head + i] === b[head + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < rows && j < cols) {
      if (a[head + i] === b[head + j]) { pairs.push([head + i, head + j]); i += 1; j += 1; }
      else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i += 1;
      else j += 1;
    }
  }
  for (let k = tail; k > 0; k -= 1) pairs.push([n - k, m - k]);
  return pairs;
}

const same = (x, y) => x.length === y.length && x.every((line, index) => line === y[index]);

/**
 * @param {string} base the text both edits started from
 * @param {string} ours this device's edit
 * @param {string} theirs the edit that arrived
 * @param {{ ours?: string, theirs?: string }} [labels] names written on the marker lines
 * @returns {{ text: string, conflicts: number }}
 */
export function mergeThreeWay(base, ours, theirs, labels = {}) {
  const o = String(base ?? '').split('\n');
  const a = String(ours ?? '').split('\n');
  const b = String(theirs ?? '').split('\n');
  const inA = new Map(commonLines(o, a));
  const inB = new Map(commonLines(o, b));

  const out = [];
  let conflicts = 0;
  const takeChunk = (oChunk, aChunk, bChunk) => {
    if (same(aChunk, oChunk)) out.push(...bChunk);
    else if (same(bChunk, oChunk) || same(aChunk, bChunk)) out.push(...aChunk);
    else {
      conflicts += 1;
      out.push(`<<<<<<< ${labels.ours || 'this device'}`, ...aChunk, '||||||| before', ...oChunk, '=======', ...bChunk, `>>>>>>> ${labels.theirs || 'synced'}`);
    }
  };

  let i = 0;
  let x = 0;
  let y = 0;
  for (let k = 0; k < o.length; k += 1) {
    // A line of the starting text both edits kept, in order: everything before it is one chunk.
    if (!inA.has(k) || !inB.has(k) || inA.get(k) < x || inB.get(k) < y) continue;
    takeChunk(o.slice(i, k), a.slice(x, inA.get(k)), b.slice(y, inB.get(k)));
    out.push(o[k]);
    i = k + 1;
    x = inA.get(k) + 1;
    y = inB.get(k) + 1;
  }
  takeChunk(o.slice(i), a.slice(x), b.slice(y));
  return { text: out.join('\n'), conflicts };
}
