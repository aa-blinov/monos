/**
 * Parse the metadata header of a template note.
 *
 * Templates typically begin with an H1 title, followed by a small block of
 * `Label: value` lines (e.g. `Created: 2026-08-14`, `Status: Draft`,
 * `Owner:`), then the actual content sections.
 *
 * This function splits the raw markdown into the structured metadata and the
 * remaining body, so the UI can render the metadata as a compact grid and the
 * rest as a normal markdown preview.
 *
 * Tolerant of:
 *   - missing H1 (e.g. for templates that are pure body)
 *   - missing blank line between H1 and metadata
 *   - empty / null / undefined input
 *   - field values that contain colons (e.g. URLs)
 *
 * @param {string} markdown raw template markdown
 * @returns {{ metadata: Array<{label: string, value: string}>, rest: string }}
 */
export function extractTemplateMetadata(markdown) {
  const text = String(markdown == null ? '' : markdown);
  if (!text) return { metadata: [], rest: '' };

  const lines = text.split('\n');
  let i = 0;

  // Skip leading H1 and any blank lines that follow it.
  if (i < lines.length && /^#\s/.test(lines[i])) {
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') {
    i++;
  }

  // Read consecutive `Label: value` lines.
  const metadata = [];
  const metaLine = /^([A-Z][A-Za-z][A-Za-z ]*?):\s*(.*)$/;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') break;
    const m = line.match(metaLine);
    if (!m) break;
    metadata.push({ label: m[1].trim(), value: m[2].trim() });
    i++;
  }

  // Skip the blank line(s) after metadata before the rest.
  while (i < lines.length && lines[i].trim() === '') {
    i++;
  }

  return { metadata, rest: lines.slice(i).join('\n') };
}

/**
 * An empty list item in a template is a marker with nothing after it: `1.`, `2.`,
 * or `-`. A space after the marker makes marked read the lines as a paragraph, so
 * the numbers ran together on one line in the preview. Dropping that trailing
 * space keeps them list items, as the editor shows them.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function normalizeEmptyListItems(markdown) {
  return String(markdown == null ? '' : markdown).replace(/^([ \t]*(?:[-*+]|\d+[.)]))[ \t]+$/gm, '$1');
}
