import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { persisted } from './persisted.js';

class MemoryStorage {
  constructor(initial = {}) {
    this.store = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
}

function withStorage(initial, fn) {
  const prev = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage(initial);
  try {
    return fn();
  } finally {
    globalThis.localStorage = prev;
  }
}

test('persisted читает значение из localStorage при инициализации', () => {
  withStorage({ theme: 'nord' }, () => {
    const store = persisted('theme', 'gruvbox');
    assert.equal(get(store), 'nord');
  });
});

test('persisted использует fallback, если ключа нет', () => {
  withStorage({}, () => {
    const store = persisted('theme', 'gruvbox');
    assert.equal(get(store), 'gruvbox');
  });
});

test('persisted пишет значение в localStorage при set', () => {
  withStorage({}, () => {
    const store = persisted('theme', 'gruvbox');
    store.set('solarized');
    assert.equal(globalThis.localStorage.getItem('theme'), 'solarized');
  });
});

test('persisted сериализует boolean как "true"/"false" по умолчанию', () => {
  withStorage({}, () => {
    const store = persisted('boardGroupByColor', false);
    store.set(true);
    assert.equal(globalThis.localStorage.getItem('boardGroupByColor'), 'true');
  });
});

test('persisted отбрасывает невалидное значение и использует fallback', () => {
  withStorage({ fontSize: 'huge' }, () => {
    const store = persisted('fontSize', 'medium', {
      validate: (v) => ['small', 'medium', 'large'].includes(v),
    });
    assert.equal(get(store), 'medium');
  });
});

test('persisted принимает валидное значение из localStorage', () => {
  withStorage({ fontSize: 'large' }, () => {
    const store = persisted('fontSize', 'medium', {
      validate: (v) => ['small', 'medium', 'large'].includes(v),
    });
    assert.equal(get(store), 'large');
  });
});

test('persisted применяет migrate для legacy ключей при инициализации', () => {
  withStorage({ darkMode: 'true' }, () => {
    const store = persisted('themeMode', 'system', {
      migrate: (saved, read) => {
        if (saved !== null) return saved;
        const legacy = read('darkMode');
        if (legacy === 'true') return 'dark';
        if (legacy === 'false') return 'light';
        return 'system';
      },
    });
    assert.equal(get(store), 'dark');
  });
});

test('persisted использует saved значение, если migrate не нужен', () => {
  withStorage({ themeMode: 'light' }, () => {
    const store = persisted('themeMode', 'system', {
      migrate: (saved, read) => {
        if (saved !== null) return saved;
        return read('darkMode') === 'true' ? 'dark' : 'system';
      },
    });
    assert.equal(get(store), 'light');
  });
});

test('persisted использует custom serialize для записи', () => {
  withStorage({}, () => {
    const store = persisted('themeMode', 'system', {
      serialize: (value) => {
        if (value === 'system') return null;
        return String(value);
      },
    });
    store.set('system');
    assert.equal(globalThis.localStorage.getItem('themeMode'), null);
    store.set('dark');
    assert.equal(globalThis.localStorage.getItem('themeMode'), 'dark');
  });
});

test('persisted notify подписчиков при изменении', () => {
  withStorage({}, () => {
    const store = persisted('fontFamily', 'JetBrains Mono');
    let observed = null;
    const unsub = store.subscribe(v => { observed = v; });
    store.set('Fira Code');
    assert.equal(observed, 'Fira Code');
    unsub();
  });
});

test('persisted применяет deserialize к прочитанному значению', () => {
  withStorage({ boardGroupByColor: 'true' }, () => {
    const store = persisted('boardGroupByColor', false, {
      serialize: (v) => String(v),
      deserialize: (s) => s === 'true',
    });
    assert.equal(get(store), true);
  });
});

test('persisted deserialize работает с fallback', () => {
  withStorage({}, () => {
    const store = persisted('boardGroupByColor', false, {
      serialize: (v) => String(v),
      deserialize: (s) => s === 'true',
    });
    assert.equal(get(store), false);
  });
});

test('persisted validate получает уже десериализованное значение', () => {
  withStorage({ fontSize: 'LARGE' }, () => {
    const store = persisted('fontSize', 'medium', {
      deserialize: (s) => String(s).toLowerCase(),
      validate: (v) => ['small', 'medium', 'large'].includes(v),
    });
    assert.equal(get(store), 'large');
  });
});

// A fresh copy of the module: the registry of synced stores lives in module scope.
let copy = 0;
async function freshModule() {
  copy += 1;
  return import(`./persisted.js?copy=${copy}`);
}

test('предпочтения с server: true приходят с сервера, когда localStorage пуст (новый origin)', async () => {
  const mod = await freshModule();
  const prev = globalThis.localStorage;
  try {
    // Launch 1: the person picks a wide column. It goes to localStorage and, after a pause, to the server.
    globalThis.localStorage = new MemoryStorage();
    const sent = [];
    const width = mod.persisted('contentWidth', 'medium', { server: true });
    const columns = mod.persisted('boardColumns', '3', { server: true });
    mod.startPreferenceSync({}, (payload) => sent.push(payload));
    width.set('wide');
    mod.flushPreferences();
    assert.deepEqual(sent, [{ contentWidth: 'wide' }]);
    const server = { contentWidth: 'wide' };

    // Launch 2: another port, so another origin and an empty localStorage. The server's copy fills the stores.
    const second = await freshModule();
    globalThis.localStorage = new MemoryStorage();
    const width2 = second.persisted('contentWidth', 'medium', { server: true });
    second.persisted('boardColumns', '3', { server: true });
    assert.equal(get(width2), 'medium');
    second.startPreferenceSync(server, () => assert.fail('nothing was changed, nothing is sent'));
    assert.equal(get(width2), 'wide');
    assert.equal(globalThis.localStorage.getItem('contentWidth'), 'wide', 'the quick copy follows');
    assert.ok(columns);
  } finally {
    globalThis.localStorage = prev;
  }
});

test('значение из localStorage, которого нет на сервере, уезжает на сервер один раз', async () => {
  const mod = await freshModule();
  const prev = globalThis.localStorage;
  try {
    globalThis.localStorage = new MemoryStorage({ lineHeight: 'relaxed', boardSort: 'title' });
    mod.persisted('lineHeight', 'normal', { server: true });
    mod.persisted('boardSort', 'modified', { server: true });
    mod.persisted('boardColumns', '3', { server: true });
    const sent = [];
    mod.startPreferenceSync({ boardSort: 'opened' }, (payload) => sent.push(payload));
    // The server's choice wins where it has one; the rest moves up.
    assert.deepEqual(sent, [{ lineHeight: 'relaxed' }]);
  } finally {
    globalThis.localStorage = prev;
  }
});

test('значение с сервера, не прошедшее проверку, не принимается', async () => {
  const mod = await freshModule();
  const prev = globalThis.localStorage;
  try {
    globalThis.localStorage = new MemoryStorage();
    const kind = mod.persisted('attachmentsKind', 'all', { server: true, validate: (v) => ['all', 'image', 'pdf'].includes(v) });
    mod.startPreferenceSync({ attachmentsKind: 'junk' }, () => {});
    assert.equal(get(kind), 'all');
  } finally {
    globalThis.localStorage = prev;
  }
});

test('preferenceSnapshot даёт текущие значения в том виде, в каком их хранит сервер', async () => {
  const mod = await freshModule();
  const prev = globalThis.localStorage;
  try {
    globalThis.localStorage = new MemoryStorage();
    const flag = mod.persisted('boardGroupByColor', false, { server: true, serialize: (v) => String(v), deserialize: (s) => s === 'true' });
    mod.persisted('lineHeight', 'normal', { server: true });
    flag.set(true);
    assert.deepEqual(mod.preferenceSnapshot(), { boardGroupByColor: 'true', lineHeight: 'normal' });
  } finally {
    globalThis.localStorage = prev;
  }
});

test('смена, сделанная при применении серверных значений, на сервер не возвращается', async () => {
  const mod = await freshModule();
  const prev = globalThis.localStorage;
  try {
    globalThis.localStorage = new MemoryStorage();
    mod.persisted('lineHeight', 'normal', { server: true });
    const sent = [];
    mod.startPreferenceSync({ lineHeight: 'relaxed' }, (payload) => sent.push(payload));
    mod.flushPreferences();
    assert.deepEqual(sent, []);
  } finally {
    globalThis.localStorage = prev;
  }
});

test('выбор, который сервер ещё не подтвердил, не отменяется его старым значением после перезагрузки', async () => {
  const mod = await freshModule();
  const prev = globalThis.localStorage;
  try {
    globalThis.localStorage = new MemoryStorage();
    const sort = mod.persisted('attachmentsSort', 'new', { server: true });
    mod.startPreferenceSync({ attachmentsSort: 'new' }, () => new Promise(() => {})); // the write is still in flight
    sort.set('size');
    mod.flushPreferences(); // the page is closing: the answer never comes back

    // The reloaded page reads the settings before that write has landed: the server still says "new".
    const second = await freshModule();
    const sort2 = second.persisted('attachmentsSort', 'new', { server: true });
    const sent = [];
    second.startPreferenceSync({ attachmentsSort: 'new' }, (payload) => { sent.push(payload); return Promise.resolve({ ok: true }); });
    assert.equal(get(sort2), 'size', 'the choice made a moment ago stays');
    assert.deepEqual(sent, [{ attachmentsSort: 'size' }], 'and goes to the server again');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(globalThis.localStorage.getItem('monosPendingPreferences'), null, 'once the server has it, the mark goes');

    // A third load takes the server's value as usual.
    const third = await freshModule();
    const sort3 = third.persisted('attachmentsSort', 'new', { server: true });
    third.startPreferenceSync({ attachmentsSort: 'name' }, () => assert.fail('nothing to send'));
    assert.equal(get(sort3), 'name');
  } finally {
    globalThis.localStorage = prev;
  }
});

test('отказ сервера оставляет отметку: выбор отправится при следующей загрузке', async () => {
  const mod = await freshModule();
  const prev = globalThis.localStorage;
  try {
    globalThis.localStorage = new MemoryStorage();
    const kind = mod.persisted('attachmentsKind', 'all', { server: true });
    mod.startPreferenceSync({}, () => Promise.resolve({ ok: false }));
    kind.set('pdf');
    mod.flushPreferences();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('monosPendingPreferences')), { attachmentsKind: 'pdf' });
  } finally {
    globalThis.localStorage = prev;
  }
});

test('неподтверждённый выбор переживает сброс быстрой копии: побеждает значение из отметки, а не умолчание', async () => {
  const mod = await freshModule();
  const prev = globalThis.localStorage;
  try {
    globalThis.localStorage = new MemoryStorage();
    const width = mod.persisted('contentWidth', 'medium', { server: true });
    mod.startPreferenceSync({}, () => new Promise(() => {}));
    width.set('broad');
    mod.flushPreferences();

    // A new origin right away: the quick copy of the key is gone, and a new store writes its default into it.
    globalThis.localStorage.removeItem('contentWidth');
    const second = await freshModule();
    const width2 = second.persisted('contentWidth', 'medium', { server: true });
    assert.equal(globalThis.localStorage.getItem('contentWidth'), 'medium');
    const sent = [];
    second.startPreferenceSync({ contentWidth: 'broad' }, (payload) => { sent.push(payload); return Promise.resolve({ ok: true }); });
    assert.equal(get(width2), 'broad');
    assert.deepEqual(sent, [{ contentWidth: 'broad' }], 'the default is never sent over the choice');
  } finally {
    globalThis.localStorage = prev;
  }
});
