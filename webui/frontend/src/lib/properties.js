// Custom note properties as the editor and the table see them. The rules are the server's (see
// webui/backend/properties.js), so a value the form accepts is one the server writes back unchanged.

export const PROPERTY_TYPES = ['text', 'number', 'date', 'checkbox', 'list'];

// The keys the app manages itself; a property cannot take one of these names.
const MANAGED_KEYS = ['title', 'tags', 'category', 'pinned', 'aliases'];
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,63}$/u;
const NUMBER = /^-?\d+(\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The name trimmed and with single spaces, or null when it cannot be a property name. */
export function propertyName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!NAME.test(name) || MANAGED_KEYS.includes(name.toLowerCase())) return null;
  return name;
}

/** Whether `iso` is a date the calendar has, such as 2026-12-01 but not 2026-02-30. */
export function isCalendarDate(iso) {
  if (!DATE.test(iso)) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The value for `type` from what a form holds, or null when it does not fit that type. */
export function propertyValueFrom(type, raw) {
  if (type === 'checkbox') {
    if (typeof raw === 'boolean') return raw;
    if (/^(true|yes)$/i.test(String(raw ?? '').trim())) return true;
    if (/^(false|no)$/i.test(String(raw ?? '').trim())) return false;
    return null;
  }
  if (type === 'number') {
    const text = String(raw ?? '').trim();
    return NUMBER.test(text) ? Number(text) : null;
  }
  if (type === 'date') {
    const iso = String(raw ?? '').trim();
    return isCalendarDate(iso) ? iso : null;
  }
  if (type === 'list') {
    return String(raw ?? '').split(',').map((item) => item.replace(/[\r\n]+/g, ' ').trim()).filter(Boolean);
  }
  if (type === 'text') return String(raw ?? '').replace(/[\r\n]+/g, ' ').trim();
  return null;
}

/** The text a form shows for a stored property: a list is its items joined with commas. */
export function propertyInputText(property) {
  if (!property) return '';
  if (Array.isArray(property.value)) return property.value.join(', ');
  return String(property.value ?? '');
}

/** The `<input type>` that edits a property of this type. Checkboxes and lists are handled by the form. */
export function propertyInputType(type) {
  if (type === 'number') return 'number';
  if (type === 'date') return 'date';
  return 'text';
}
