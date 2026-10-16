import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The device's name is what the other devices see in a note's history and in a conflict ("Phone, today
// 14:35"). It is asked on first launch and can be changed later; a change reaches git at once.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-device-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;
const { startServer, stopServer } = await import('./index.js');
const { cleanDeviceName } = await import('./routes/git.js');
let base;

test.before(async () => {
  execFileSync('git', ['init', '-q', '-b', 'master'], { cwd: notesDir });
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
});
test.after(async () => { await stopServer(); });

const setName = (name) => fetch(`${base}/api/device`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
});

test('до первого выбора имени нет, но есть вариант из имени компьютера', async () => {
  const device = await (await fetch(`${base}/api/device`)).json();
  assert.equal(device.name, '');
  assert.ok(device.suggested.length > 0);
});

test('выбранное имя сохраняется и сразу подписывает коммиты', async () => {
  const response = await setName('  Рабочий   ноутбук ');
  assert.equal(response.status, 200);
  assert.equal((await (await fetch(`${base}/api/device`)).json()).name, 'Рабочий ноутбук');
  assert.equal(execFileSync('git', ['config', 'user.name'], { cwd: notesDir, encoding: 'utf-8' }).trim(), 'Рабочий ноутбук');
  assert.match(execFileSync('git', ['config', 'user.email'], { cwd: notesDir, encoding: 'utf-8' }).trim(), /^Рабочий-ноутбук@monos\.local$/);
});

test('пустое имя не принимается, лишнее вычищается', async () => {
  assert.equal((await setName('   ')).status, 400);
  assert.equal(cleanDeviceName('Телефон <a@b>\nвторая строка'), 'Телефон a@b вторая строка');
  assert.equal(cleanDeviceName('x'.repeat(60)).length, 40);
});
