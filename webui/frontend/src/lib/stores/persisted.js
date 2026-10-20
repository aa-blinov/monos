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
  let current = initial;
  store.subscribe(value => {
    current = value;
    writeValue(key, value, serialize);
  });
  // Другое окно изменило значение (тема или язык в окне настроек): здесь оно тоже должно поменяться.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      const next = resolveInitial(key, fallback, validate, migrate, deserialize);
      if (next === current) return;
      store.set(next);
    });
  }
  return store;
}

/**
 * Keep a store in step with another window: the storage event fires in every window
 * except the one that wrote the value.
 *
 * @param {string} key - localStorage key
 * @param {import('svelte/store').Writable} store - the store to update
 * @param {() => *} read - reads the current value from localStorage
 */
export function syncedWithStorage(key, store, read) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('storage', (event) => {
    if (event.key !== key) return;
    store.set(read());
  });
}

function defaultSerialize(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function identity(value) {
  return value;
}

// No storage (a plain Node run of a lib test) means no saved values, not a crash.
const storage = () => (typeof localStorage === 'undefined' ? null : localStorage);

function resolveInitial(key, fallback, validate, migrate, deserialize) {
  const read = (k) => storage()?.getItem(k) ?? null;
  const saved = read(key);
  const migrated = migrate ? migrate(saved, read) : saved;
  if (migrated === null || migrated === undefined) return fallback;
  const value = deserialize(migrated);
  if (validate && !validate(value)) return fallback;
  return value;
}

function writeValue(key, value, serialize) {
  const serialized = serialize(value);
  if (serialized === null) storage()?.removeItem(key);
  else storage()?.setItem(key, serialized);
}
