const test = require('node:test');
const assert = require('node:assert/strict');

const { backgroundNotice } = require('./notify.cjs');

test('фоновое событие говорит своим текстом', () => {
  assert.deepEqual(
    backgroundNotice({ title: 'Notes updated', body: 'Notes received: 2' }, { focused: false }),
    { title: 'Notes updated', body: 'Notes received: 2' },
  );
});

test('окно впереди: система молчит', () => {
  assert.equal(backgroundNotice({ title: 'Notes updated' }, { focused: true }), null);
});

test('без уведомлений системы нет', () => {
  assert.equal(backgroundNotice({ title: 'Notes updated' }, { supported: false }), null);
});

test('без заголовка говорить не о чем', () => {
  assert.equal(backgroundNotice({ body: 'Notes received: 2' }), null);
  assert.equal(backgroundNotice(null), null);
  assert.equal(backgroundNotice({ title: '   ' }), null);
});
