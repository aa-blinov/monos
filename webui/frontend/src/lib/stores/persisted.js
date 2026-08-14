import { writable } from 'svelte/store';

/**
 * Create a Svelte writable store that mirrors its value to localStorage.
 *
 * @param {string} key - localStorage key
 * @param {*} fallback - value to use when nothing is stored or stored value is invalid
 * @param {object} [options]
 * @param {(value: *) => boolean} [options.validate] - reject deserialized value
 *   (returns fallback instead)
 * @param {(saved: string|null, read: (k: string) => string|null) => *} [options.migrate] -
 *   transform raw stored string before deserialization; can read other keys via `read`
 * @param {(value: *) => string|null} [options.serialize] - custom serializer; returning
 *   `null` removes the key from localStorage
 * @param {(raw: string) => *} [options.deserialize] - parse stored string into the
 *   in-memory value type (default: identity)
 * @returns {import('svelte/store').Writable}
 */
export function persisted(key, fallback, options = {}) {
  const { validate, migrate, serialize = defaultSerialize, deserialize = identity } = options;
  const initial = resolveInitial(key, fallback, validate, migrate, deserialize);
  const store = writable(initial);
  store.subscribe(value => writeValue(key, value, serialize));
  return store;
}

function defaultSerialize(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function identity(value) {
  return value;
}

function resolveInitial(key, fallback, validate, migrate, deserialize) {
  const saved = localStorage.getItem(key);
  const migrated = migrate ? migrate(saved, (k) => localStorage.getItem(k)) : saved;
  if (migrated === null || migrated === undefined) return fallback;
  const value = deserialize(migrated);
  if (validate && !validate(value)) return fallback;
  return value;
}

function writeValue(key, value, serialize) {
  const serialized = serialize(value);
  if (serialized === null) localStorage.removeItem(key);
  else localStorage.setItem(key, serialized);
}
