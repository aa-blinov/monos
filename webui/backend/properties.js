// Custom properties: the frontmatter keys a note carries besides the ones the app manages itself
// (title, tags, category, pinned, aliases). A value's type is read from its text: checkbox
// (true/false, yes/no), number, date (YYYY-MM-DD), list ([a, b] or a block list) or text. A quoted
// value is always text, so `status: "yes"` stays a word.

// Keys with their own place in the app. Properties leave them out, so they are never shown twice.
export const MANAGED_PROPERTY_KEYS = ['title', 'tags', 'category', 'pinned', 'aliases'];

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const CHECKBOX = /^(true|false|yes|no)$/i;
const NUMBER = /^-?\d+(\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCustomPropertyKey(key) {
  const name = String(key || '').trim().toLowerCase();
  return Boolean(name) && !MANAGED_PROPERTY_KEYS.includes(name);
}

// A double-quoted value is JSON-escaped (the app writes it that way), so it is decoded as JSON first.
function unquote(value) {
  const text = String(value || '').trim();
  if (text.startsWith('"')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Not JSON after all: a quoted word typed by hand, handled below.
    }
  }
  const quoted = /^(["'])([\s\S]*)\1$/.exec(text);
  return quoted ? quoted[2] : text;
}

// A flow list written by the app is JSON (`["a, b", "c"]`); one typed by hand is `[a, b]`.
function splitFlowList(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter((item) => item !== '');
  } catch {
    // Not JSON: a hand-typed list, split on commas below.
  }
  // Commas inside quotes belong to the item: `[Ann, "Bo, Jr"]` has two items.
  const items = [];
  let current = '';
  let quote = null;
  for (const char of raw.slice(1, -1)) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
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
  return items.map((item) => unquote(item)).filter((item) => item !== '');
}

/** Type and value of one inline YAML value (the text after `key:`). */
function classify(raw) {
  const text = String(raw || '').trim();
  if (!text) return { type: 'text', value: '' };
  if (/^["']/.test(text)) return { type: 'text', value: unquote(text) };
  if (text.startsWith('[') && text.endsWith(']')) return { type: 'list', value: splitFlowList(text) };
  if (CHECKBOX.test(text)) return { type: 'checkbox', value: /^(true|yes)$/i.test(text) };
  if (NUMBER.test(text)) return { type: 'number', value: Number(text) };
  if (DATE.test(text)) return { type: 'date', value: text };
  return { type: 'text', value: text };
}

/**
 * The custom properties of a note, in the order they are written. Only top-level keys count, and
 * a key whose value is a block list (`key:` then `  - item` lines) reads as a list.
 *
 * @param {string} content
 * @returns {Array<{ key: string, type: 'text'|'number'|'date'|'checkbox'|'list', value: string|number|boolean|string[] }>}
 */
export function readProperties(content) {
  const match = FRONTMATTER.exec(String(content || ''));
  if (!match) return [];

  const lines = match[1].split(/\r?\n/);
  const properties = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const separator = line.indexOf(':');
    if (separator <= 0 || /^\s/.test(line)) continue;

    const key = line.slice(0, separator).trim();
    if (!isCustomPropertyKey(key)) continue;

    const raw = line.slice(separator + 1).trim();
    if (raw === '') {
      const items = [];
      while (index + 1 < lines.length && /^\s+-\s/.test(lines[index + 1])) {
        index += 1;
        const item = unquote(lines[index].trim().replace(/^-\s*/, ''));
        if (item !== '') items.push(item);
      }
      properties.push(items.length > 0 ? { key, type: 'list', value: items } : { key, type: 'text', value: '' });
      continue;
    }
    properties.push({ key, ...classify(raw) });
  }
  return properties;
}

/** How a value is written into the frontmatter. Numbers, checkboxes and dates are written bare, so YAML reads them back as their type. */
export function formatPropertyValue(type, value) {
  if (type === 'checkbox') return value ? 'true' : 'false';
  if (type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : JSON.stringify(String(value ?? ''));
  }
  if (type === 'date') {
    const iso = String(value ?? '').trim();
    return DATE.test(iso) ? iso : JSON.stringify(iso);
  }
  if (type === 'list') {
    const items = (Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((item) => String(item).trim())
      .filter(Boolean);
    return `[${items.map((item) => JSON.stringify(item)).join(', ')}]`;
  }
  return JSON.stringify(String(value ?? ''));
}

/** The value as the search reads it: a list is its items, a checkbox is `true` or `false`. */
export function propertyText(property) {
  if (Array.isArray(property?.value)) return property.value.join(', ');
  return String(property?.value ?? '');
}

export const PROPERTY_TYPES = ['text', 'number', 'date', 'checkbox', 'list'];

// A name a person can type: a letter or digit first, then letters, digits, spaces, dashes or underscores.
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,63}$/u;

/** The property name trimmed, or null when it cannot be written as a top-level frontmatter key. */
export function normalizePropertyKey(key) {
  const name = String(key ?? '').trim().replace(/\s+/g, ' ');
  if (!NAME.test(name) || MANAGED_PROPERTY_KEYS.includes(name.toLowerCase())) return null;
  return name;
}

/** The type when it is one of PROPERTY_TYPES, otherwise null. */
export function normalizePropertyType(type) {
  return PROPERTY_TYPES.includes(type) ? type : null;
}

/**
 * The value for `type`, or null when it does not fit that type. A frontmatter value sits on one
 * line, so text loses its line breaks. A list takes an array or a comma-separated string.
 */
export function normalizePropertyValue(type, value) {
  if (type === 'checkbox') {
    if (typeof value === 'boolean') return value;
    if (/^(true|yes)$/i.test(String(value))) return true;
    if (/^(false|no)$/i.test(String(value))) return false;
    return null;
  }
  if (type === 'number') {
    const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
    return NUMBER.test(text) ? Number(text) : null;
  }
  if (type === 'date') {
    const iso = String(value ?? '').trim();
    if (!DATE.test(iso)) return null;
    // Rejects dates the calendar does not have, such as 2026-02-30.
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const exists = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return exists ? iso : null;
  }
  if (type === 'list') {
    const items = Array.isArray(value) ? value : String(value ?? '').split(',');
    return items.map((item) => String(item).replace(/[\r\n]+/g, ' ').trim()).filter(Boolean);
  }
  if (type === 'text') return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return null;
}

/** The properties kept in the index column (a JSON array). An empty or broken column reads as none. */
export function parseStoredProperties(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
