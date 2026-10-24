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
 * @param {boolean} [options.server] - the choice also lives on the server (see startPreferenceSync): the
 *   packaged app opens on a new port every launch, and the browser keeps localStorage per origin, so a value
 *   kept only there is a value lost
 * @returns {import('svelte/store').Writable}
 */
export function persisted(key, fallback, options = {}) {
  const { validate, migrate, serialize = defaultSerialize, deserialize = identity, server = false } = options;
  const initial = resolveInitial(key, fallback, validate, migrate, deserialize);
  const store = writable(initial);
  let current = initial;
  store.subscribe(value => {
    current = value;
    writeValue(key, value, serialize);
    if (server && preferencesReady && !applyingServerValues) queuePreference(key, serialize(value));
  });
  if (server) serverStores.set(key, { store, validate, deserialize, serialize, read: () => current, fallbackRaw: serialize(fallback) });
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

// Preferences that also live on the server. localStorage stays the quick copy the page starts from; the server's
// settings file is the copy that survives a new origin.
const serverStores = new Map();
const unsent = {};
let preferencesReady = false;
let applyingServerValues = false;
let sendPreferences = null;
let sendTimer = null;
const SEND_DELAY = 300;

// A choice the server has not confirmed yet. Reloading right after a click can let the page's first read of the
// settings overtake the write that the closing page sent, and the server's older value would then undo the choice.
// The browser's copy keeps the unconfirmed value itself (not just a mark: the quick copy of a key can be reset to its
// default by then), and on the next load it wins over the server and is sent again.
const PENDING_KEY = 'monosPendingPreferences';

function readPending() {
  try {
    const parsed = JSON.parse(storage()?.getItem(PENDING_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, raw]) => typeof raw === 'string'));
  } catch {
    return {};
  }
}

function writePending(pending) {
  try {
    if (Object.keys(pending).length) storage()?.setItem(PENDING_KEY, JSON.stringify(pending));
    else storage()?.removeItem(PENDING_KEY);
  } catch {
    // A store that refuses a write only loses the safety net.
  }
}

function settle(sent, response) {
  // A write the server refused is still pending; one that went through is not, unless the choice has changed since.
  if (response && response.ok === false) return;
  const pending = readPending();
  for (const [key, raw] of Object.entries(sent)) if (pending[key] === raw) delete pending[key];
  writePending(pending);
}

function queuePreference(key, raw) {
  if (raw === null || raw === undefined || !sendPreferences) return;
  unsent[key] = raw;
  writePending({ ...readPending(), [key]: raw });
  clearTimeout(sendTimer);
  sendTimer = setTimeout(flushPreferences, SEND_DELAY);
}

/** Send what has changed now, not after the pause: the window is closing. */
export function flushPreferences() {
  clearTimeout(sendTimer);
  sendTimer = null;
  const keys = Object.keys(unsent);
  if (!keys.length || !sendPreferences) return;
  const payload = {};
  for (const key of keys) {
    payload[key] = unsent[key];
    delete unsent[key];
  }
  Promise.resolve(sendPreferences(payload)).then((response) => settle(payload, response)).catch(() => {});
}

/**
 * Take the preferences from the server's settings and keep sending later changes there. A value the server does
 * not have yet is this browser's own saved choice, and goes up once: that is how what lived in localStorage moves.
 *
 * @param {object|null} settings the server's settings
 * @param {(payload: object) => *} send writes a partial settings object
 */
export function startPreferenceSync(settings, send) {
  sendPreferences = send;
  const upload = {};
  const pending = readPending();
  applyingServerValues = true;
  try {
    for (const [key, entry] of serverStores) {
      const raw = settings?.[key];
      if (pending[key] !== undefined) {
        // Chosen here a moment ago and not confirmed by the server: the older server value must not win.
        const value = entry.deserialize(pending[key]);
        if (!entry.validate || entry.validate(value)) {
          if (!Object.is(entry.read(), value)) entry.store.set(value);
          upload[key] = pending[key];
          continue;
        }
      }
      if (raw !== undefined && raw !== null && typeof raw !== 'object') {
        const value = entry.deserialize(String(raw));
        if (!entry.validate || entry.validate(value)) {
          if (!Object.is(entry.read(), value)) entry.store.set(value);
          continue;
        }
      }
      const local = storage()?.getItem(key);
      // Only a choice is worth sending: the default is what the server answers for a key it does not have.
      if (local !== null && local !== undefined && local !== entry.fallbackRaw) upload[key] = local;
    }
  } finally {
    applyingServerValues = false;
  }
  preferencesReady = true;
  if (Object.keys(upload).length) {
    const sent = { ...upload };
    Promise.resolve(send(upload)).then((response) => settle(sent, response)).catch(() => {});
  }
  // A leftover for a key that is no longer synced would never be cleared otherwise.
  const kept = readPending();
  for (const key of Object.keys(kept)) if (!serverStores.has(key)) delete kept[key];
  writePending(kept);
}

/** Every synced preference as the server stores it, so a form that saves the whole settings object cannot put old values back. */
export function preferenceSnapshot() {
  const snapshot = {};
  for (const [key, entry] of serverStores) {
    const raw = entry.serialize(entry.read());
    if (raw !== null && raw !== undefined) snapshot[key] = raw;
  }
  return snapshot;
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
