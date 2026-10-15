import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRegisterServiceWorker } from './service-worker.js';

const installable = { production: true, secureContext: true, protocol: 'https:', supported: true };

test('сервис-воркер регистрируется только в сборке, по HTTPS и в браузере, который его умеет', () => {
  assert.equal(shouldRegisterServiceWorker(installable), true);
  assert.equal(shouldRegisterServiceWorker({ ...installable, production: false }), false);
  assert.equal(shouldRegisterServiceWorker({ ...installable, protocol: 'http:' }), false);
  assert.equal(shouldRegisterServiceWorker({ ...installable, secureContext: false }), false);
  assert.equal(shouldRegisterServiceWorker({ ...installable, supported: false }), false);
});

test('на этом компьютере и по адресу сети по HTTP воркер не регистрируется', () => {
  assert.equal(shouldRegisterServiceWorker({ production: true, secureContext: true, protocol: 'http:', supported: true }), false);
});
