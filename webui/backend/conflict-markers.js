// A note that still holds the markers git leaves in a file both devices changed. `=======` alone is a legal Markdown
// underline, so a conflict means the opening and the closing marker are both there.
const OPENING = /^<{7}(?: |$)/m;
const CLOSING = /^>{7}(?: |$)/m;

export function looksConflicted(text) {
  const value = String(text ?? '');
  return OPENING.test(value) && CLOSING.test(value);
}

/**
 * The text a card can show for a conflicted note: this device's side of every conflict, with the markers, the base
 * section and the other side left out. Raw `<<<<<<<` lines in a card read as damage, not as a state to resolve.
 */
export function withoutConflictMarkers(text) {
  let part = 'plain';
  const kept = [];
  for (const line of String(text ?? '').split('\n')) {
    if (/^<{7}(?: |$)/.test(line)) { part = 'ours'; continue; }
    if (part !== 'plain' && /^\|{7}(?: |$)/.test(line)) { part = 'base'; continue; }
    if (part !== 'plain' && /^={7}\r?$/.test(line)) { part = 'theirs'; continue; }
    if (part !== 'plain' && /^>{7}(?: |$)/.test(line)) { part = 'plain'; continue; }
    if (part === 'plain' || part === 'ours') kept.push(line);
  }
  return kept.join('\n');
}
