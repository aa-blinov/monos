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
