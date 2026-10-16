/**
 * A sync conflict inside a note's properties (the frontmatter block at the top of the file).
 *
 * The block is YAML, not prose: shown raw it reads as `tags: ["дом"]` under a horizontal rule, and
 * "keep both" pasted both sides one after the other gives two `tags:` keys — a block that no longer
 * parses. Here a property conflict is shown as named values ("Tags: дом"), and "both" merges by key:
 * lists are joined, a key only one side has is kept. Two different values for one plain key (two due
 * dates) cannot both stay, so "both" is not offered for them.
 */

const KEY_LINE = /^([A-Za-z0-9_-]+):(?:\s(.*))?$/;

/** Where the properties block ends in the raw text (just past its closing `---` line), or 0 if there is none. */
export function frontmatterEnd(source) {
  const text = String(source || '');
  const bom = text.startsWith('﻿') ? 1 : 0;
  if (!/^---\r?\n/.test(text.slice(bom))) return 0;
  const lines = text.split('\n');
  let offset = lines[0].length + 1;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].replace(/\r$/, '');
    if (line === '---') return offset + lines[i].length + 1;
    offset += lines[i].length + 1;
  }
  return 0;
}

/** Split a block of YAML lines into `{ key, value, items }` entries; `items` is set for lists. */
export function propertyEntries(text) {
  const entries = [];
  for (const line of String(text || '').split('\n')) {
    const match = line.match(KEY_LINE);
    if (match) {
      entries.push({ key: match[1], raw: [line], value: (match[2] || '').trim() });
    } else if (entries.length && line.trim()) {
      entries[entries.length - 1].raw.push(line);
    }
  }
  for (const entry of entries) {
    const inline = entry.value.match(/^\[(.*)\]$/s);
    const block = !entry.value && entry.raw.length > 1 && entry.raw.slice(1).every((line) => /^\s*-\s/.test(line));
    if (inline) entry.items = splitInlineList(inline[1]);
    else if (block) entry.items = entry.raw.slice(1).map((line) => unquote(line.replace(/^\s*-\s+/, '')));
  }
  return entries;
}

function unquote(value) {
  const text = String(value).trim();
  if (/^"(.*)"$/s.test(text)) {
    try { return JSON.parse(text); } catch { return text.slice(1, -1); }
  }
  if (/^'(.*)'$/s.test(text)) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

function splitInlineList(inner) {
  const items = [];
  let current = '';
  let quote = '';
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ',') {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map(unquote).filter((item) => item !== '');
}

/**
 * "Keep both" for a property conflict: the merged YAML, or null when the two sides give one plain key two
 * different values. Lists are joined without repeats, in the order this device had them.
 */
export function mergeProperties(ours, theirs) {
  const mine = propertyEntries(ours);
  const other = propertyEntries(theirs);
  const otherByKey = new Map(other.map((entry) => [entry.key, entry]));
  const lines = [];
  for (const entry of mine) {
    const match = otherByKey.get(entry.key);
    otherByKey.delete(entry.key);
    if (!match || match.raw.join('\n') === entry.raw.join('\n')) {
      lines.push(...entry.raw);
    } else if (entry.items && match.items) {
      const items = [...new Set([...entry.items, ...match.items])];
      lines.push(`${entry.key}: [${items.map((item) => JSON.stringify(item)).join(', ')}]`);
    } else {
      return null;
    }
  }
  for (const entry of otherByKey.values()) lines.push(...entry.raw);
  return lines.join('\n');
}

/**
 * The properties as a reader sees them: one "Name: value" line each, lists joined with commas.
 *
 * @param {string} text the YAML lines of one side
 * @param {Record<string, string>} names display names of the known keys
 * @param {{ yes: string, no: string, date?: (iso: string) => string }} [words] how true, false and dates read
 */
export function describeProperties(text, names = {}, words = { yes: 'yes', no: 'no' }) {
  return propertyEntries(text).map((entry) => {
    const label = names[entry.key.toLowerCase()] || entry.key;
    const plain = unquote(entry.value);
    const value = entry.items
      ? entry.items.join(', ')
      : plain === 'true' ? words.yes
        : plain === 'false' ? words.no
          : /^\d{4}-\d{2}-\d{2}$/.test(plain) && words.date ? words.date(plain)
            : plain;
    return `${label}: ${value || '—'}`;
  }).join('\n');
}
