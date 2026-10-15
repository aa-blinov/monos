import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The settings file lives in the notes root: keep the test away from the real data.
process.env.NOTES_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-lan-unit-'));
const lan = await import('./lan-access.js');

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const off = { enabled: false, token: TOKEN };
const on = { enabled: true, token: TOKEN };

test('свой компьютер — loopback-адреса, остальные адреса — нет', () => {
  assert.equal(lan.isLoopbackAddress('127.0.0.1'), true);
  assert.equal(lan.isLoopbackAddress('::1'), true);
  assert.equal(lan.isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(lan.isLoopbackAddress('192.168.1.20'), false);
  assert.equal(lan.isLoopbackAddress(''), false);
});

test('имя хоста: loopback всегда, адрес сети и .local — только при включённом доступе, DNS-имя — никогда', () => {
  assert.equal(lan.hostAllowed('localhost', false), true);
  assert.equal(lan.hostAllowed('127.0.0.1', false), true);
  assert.equal(lan.hostAllowed('192.168.1.20', false), false);
  assert.equal(lan.hostAllowed('192.168.1.20', true), true);
  assert.equal(lan.hostAllowed('macbook.local', true), true);
  assert.equal(lan.hostAllowed('evil.example.com', true), false);
  assert.equal(lan.hostAllowed('example.com', false), false);
});

test('доступ: свой компьютер пускается без токена, другой — только с токеном, а в ссылке токен — только на главной', () => {
  const base = { remoteAddress: '192.168.1.20', config: on, cookieToken: null, bearerToken: null, queryToken: null, pathname: '/api/notes/recent' };
  assert.equal(lan.requestAuthorized({ ...base, remoteAddress: '127.0.0.1' }), true);
  assert.equal(lan.requestAuthorized({ ...base, config: off, cookieToken: TOKEN }), false);
  assert.equal(lan.requestAuthorized(base), false);
  assert.equal(lan.requestAuthorized({ ...base, cookieToken: 'не тот токен' }), false);
  assert.equal(lan.requestAuthorized({ ...base, cookieToken: TOKEN }), true);
  assert.equal(lan.requestAuthorized({ ...base, bearerToken: TOKEN }), true);
  assert.equal(lan.requestAuthorized({ ...base, queryToken: TOKEN }), false);
  assert.equal(lan.requestAuthorized({ ...base, queryToken: TOKEN, pathname: '/' }), true);
});

test('адрес привязки: на сеть только при включённом доступе', () => {
  assert.equal(lan.bindHostFor(off), '127.0.0.1');
  assert.equal(lan.bindHostFor(on), '0.0.0.0');
});

test('включение создаёт токен, выключение его сохраняет, смена даёт новый', () => {
  const enabled = lan.setLanEnabled(true);
  assert.equal(enabled.enabled, true);
  assert.ok(enabled.token.length >= 43);
  const disabled = lan.setLanEnabled(false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.token, enabled.token);
  const renewed = lan.regenerateLanToken();
  assert.notEqual(renewed.token, enabled.token);
  assert.equal(renewed.enabled, false);
});

test('cookie: читается по имени, с декодированием; ссылка с токеном строится на адреса сети', () => {
  assert.equal(lan.readCookie('a=1; monos_token=abc%3D; b=2', 'monos_token'), 'abc=');
  assert.equal(lan.readCookie('a=1', 'monos_token'), null);
  assert.match(lan.accessCookie(TOKEN), /HttpOnly; SameSite=Strict; Path=\/;/);
  for (const url of lan.networkUrls(8123, TOKEN)) {
    assert.match(url, /^http:\/\/\d{1,3}(\.\d{1,3}){3}:8123\/\?token=/);
  }
});
