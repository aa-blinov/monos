/**
 * Which words differ between two versions of a passage, for the conflict view.
 *
 * When one word changed in a long paragraph, two plain columns make the reader hunt for it; marking the
 * words that differ is what Notesnook and the merge editors do. Words are compared whole, with the spaces
 * between them kept as their own pieces, so the marked text reads exactly as written.
 */

/** Pieces of text, words and runs of whitespace alternating. */
function tokenize(text) {
  return String(text || '').split(/(\s+)/).filter((piece) => piece !== '');
}

/** Past this many word pairs the comparison costs more than it helps; the columns are shown unmarked. */
const MAX_CELLS = 250_000;

/**
 * @param {string} ours
 * @param {string} theirs
 * @returns {{ ours: Array<{ text: string, changed: boolean }>, theirs: Array<{ text: string, changed: boolean }> }}
 */
export function wordDiff(ours, theirs) {
  const a = tokenize(ours);
  const b = tokenize(theirs);
  const plain = (tokens) => (tokens.length ? [{ text: tokens.join(''), changed: false }] : []);
  if (a.length * b.length > MAX_CELLS) return { ours: plain(a), theirs: plain(b) };

  // Longest common subsequence, filled from the end so the walk below goes forward.
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const left = [];
  const right = [];
  const push = (list, text, changed) => {
    const last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(left, a[i], false);
      push(right, b[j], false);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      push(left, a[i], !/^\s+$/.test(a[i]));
      i += 1;
    } else {
      push(right, b[j], !/^\s+$/.test(b[j]));
      j += 1;
    }
  }
  for (; i < a.length; i += 1) push(left, a[i], !/^\s+$/.test(a[i]));
  for (; j < b.length; j += 1) push(right, b[j], !/^\s+$/.test(b[j]));
  return { ours: joinChanges(left), theirs: joinChanges(right) };
}

/** A space between two changed words belongs to the change: one mark reads better than two. */
function joinChanges(pieces) {
  const out = [];
  for (let k = 0; k < pieces.length; k += 1) {
    const piece = pieces[k];
    const bridge = !piece.changed && /^[ \t]+$/.test(piece.text) && out[out.length - 1]?.changed && pieces[k + 1]?.changed;
    if (bridge || (piece.changed && out[out.length - 1]?.changed)) {
      out[out.length - 1].text += piece.text;
      continue;
    }
    out.push({ ...piece });
  }
  return out;
}
