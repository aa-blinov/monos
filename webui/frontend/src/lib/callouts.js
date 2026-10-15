// Obsidian callouts: a quote whose first line is a marker, `> [!warning] Careful`. The text stays a quote
// in the file; the editor only draws it as a callout, so the note reads the same in git.

const MARKER = /^\[!([A-Za-z][\w-]*)\][+-]?\s*(.*)$/;

const GREEN = ['tip', 'hint', 'important', 'success', 'check', 'done'];
const YELLOW = ['warning', 'caution', 'attention'];
const RED = ['danger', 'error', 'failure', 'fail', 'bug', 'missing'];

/** The callout type and title of a quote's first line, or null when the quote is no callout. */
export function calloutMarker(firstLine) {
  const match = MARKER.exec(String(firstLine ?? '').trim());
  if (!match) return null;
  return { type: match[1].toLowerCase(), title: match[2].trim() };
}

// The markdown serializer escapes the `[` of a marker the way it escapes a link label. Obsidian needs the
// bare `[!type]`, so the escape comes off at the start of a quoted line.
const ESCAPED_MARKER = /^((?:[ \t]*>)+ ?)\\\[!([A-Za-z][\w-]*)\\\]/gm;

export function unescapeCalloutMarkers(markdown) {
  return String(markdown ?? '').replace(ESCAPED_MARKER, '$1[!$2]');
}

/** The colour family of a callout type: tips and successes green, warnings yellow, errors red, the rest neutral. */
export function calloutTone(type) {
  if (GREEN.includes(type)) return 'green';
  if (YELLOW.includes(type)) return 'yellow';
  if (RED.includes(type)) return 'red';
  return 'neutral';
}
