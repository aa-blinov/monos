import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyDue, wasNotified, resetNotified, canNotify } from './reminders.js';

// node не даёт localStorage, а без него «уже показывали» всегда читается как
// «не показывали» и проверка на повторное уведомление проходит вхолостую.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

function withFakeNotifications(permission, run) {
  const shown = [];
  const original = globalThis.Notification;
  globalThis.Notification = function Fake(title, options) {
    shown.push({ title, body: options?.body, tag: options?.tag });
  };
  globalThis.Notification.permission = permission;
  try {
    return run(shown);
  } finally {
    if (original === undefined) delete globalThis.Notification;
    else globalThis.Notification = original;
  }
}

test('уведомление не показывается, пока заметка не наступила', () => {
  resetNotified();
  withFakeNotifications('granted', (shown) => {
    const result = notifyDue(
      { path: 'notes/a.md', name: 'План', due: '2099-01-01', status: 'later' },
      { title: 'План', body: 'через много дней' },
    );
    assert.equal(result, false);
    assert.equal(shown.length, 0);
    assert.equal(wasNotified('notes/a.md', '2099-01-01'), false);
  });
});

test('просроченная заметка получает уведомление один раз', () => {
  resetNotified();
  withFakeNotifications('granted', (shown) => {
    const note = { path: 'notes/b.md', name: 'Отчёт', due: '2020-01-01', status: 'overdue' };
    const message = { title: 'Отчёт', body: 'просрочено' };

    assert.equal(notifyDue(note, message), true);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].body, 'просрочено');

    // Второй вызов в той же сессии молчит.
    assert.equal(notifyDue(note, message), false);
    assert.equal(shown.length, 1);
    assert.equal(wasNotified('notes/b.md', '2020-01-01'), true);
  });
});

test('срок «сегодня» тоже напоминает', () => {
  resetNotified();
  withFakeNotifications('granted', (shown) => {
    assert.equal(
      notifyDue({ path: 'notes/c.md', name: 'Звонок', due: '2026-10-12', status: 'today' }, { title: 'Звонок', body: 'сегодня' }),
      true,
    );
    assert.equal(shown.length, 1);
  });
});

test('новый срок той же заметки напоминает снова', () => {
  resetNotified();
  withFakeNotifications('granted', (shown) => {
    const message = { title: 'Отчёт', body: 'просрочено' };

    assert.equal(notifyDue({ path: 'notes/g.md', name: 'Отчёт', due: '2020-01-01', status: 'overdue' }, message), true);
    // Срок перенесли на другой день — это новая пара «заметка + срок».
    assert.equal(notifyDue({ path: 'notes/g.md', name: 'Отчёт', due: '2020-02-01', status: 'overdue' }, message), true);

    assert.equal(shown.length, 2);
    assert.equal(wasNotified('notes/g.md', '2020-01-01'), true);
    assert.equal(wasNotified('notes/g.md', '2020-02-01'), true);
  });
});

test('без разрешения браузера уведомление не создаётся', () => {
  resetNotified();
  withFakeNotifications('denied', (shown) => {
    assert.equal(canNotify(), false);
    assert.equal(
      notifyDue({ path: 'notes/d.md', name: 'X', due: '2020-01-01', status: 'overdue' }, { title: 'X', body: 'y' }),
      false,
    );
    assert.equal(shown.length, 0);
  });
});

test('заметка без срока не вызывает уведомление', () => {
  resetNotified();
  withFakeNotifications('granted', (shown) => {
    assert.equal(notifyDue({ path: 'notes/e.md', name: 'X', due: '', status: 'none' }, { title: 'X', body: 'y' }), false);
    assert.equal(notifyDue(null, { title: 'X', body: 'y' }), false);
    assert.equal(shown.length, 0);
  });
});

test('в уведомление попадает тег заметки — оно заменит прежнее, а не накопит пачку', () => {
  resetNotified();
  withFakeNotifications('granted', (shown) => {
    notifyDue({ path: 'notes/f.md', name: 'X', due: '2020-01-01', status: 'overdue' }, { title: 'X', body: 'y' });
    assert.equal(shown[0].tag, 'monos-due-notes/f.md');
  });
});