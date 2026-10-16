import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// One device deleted a note, the other changed it: git stops with no markers in any text, so the note
// must be resolved as a whole — keep it, or let the deletion stand.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-conflict-delete-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');

const git = (args) => execFileSync('git', args, { cwd: notesDir, encoding: 'utf-8' }).trim();
const write = (name, text) => fs.writeFileSync(path.join(notesDir, name), text, 'utf-8');
let base;

/** A note changed here and deleted on the other branch, merged into a conflict. */
function deleteVersusChange(name) {
  write(name, 'Хлеб.\n');
  git(['add', '-A']); git(['commit', '-qm', `add ${name}`]);
  git(['checkout', '-qb', `other-${name.length}`]);
  git(['rm', '-q', name]); git(['commit', '-qm', 'deleted there']);
  git(['checkout', '-q', 'master']);
  write(name, 'Хлеб.\nСыр.\n');
  git(['commit', '-qam', 'changed here']);
  try { git(['merge', `other-${name.length}`]); } catch { /* conflict expected */ }
}

test.before(async () => {
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 'Test']);
  write('Начало.md', 'Начало.\n');
  git(['add', '-A']); git(['commit', '-qm', 'base']);
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
});

test.after(async () => { await stopServer(); });

const keep = (name, side) => fetch(`${base}/api/git/resolve-note`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: `notes/${name}`, keep: side }),
}).then((r) => r.json());

test('удалённая на другом устройстве заметка видна в списке конфликтов', async () => {
  deleteVersusChange('Покупки.md');
  const [item] = await (await fetch(`${base}/api/git/conflicts`)).json();
  assert.equal(item.path, 'Покупки.md');
  assert.equal(item.oursExists, true);
  assert.equal(item.theirsExists, false);
});

test('согласиться с удалением: файла нет, конфликт закрыт, текст сохранён в архиве', async () => {
  const body = await keep('Покупки.md', 'theirs');
  assert.equal(body.resolved, true);
  assert.equal(body.removed, true);
  assert.equal(fs.existsSync(path.join(notesDir, 'Покупки.md')), false);
  const status = await (await fetch(`${base}/api/git/status`)).json();
  assert.notEqual(status.status, 'conflict');
  const archive = path.join(notesDir, '.monos', 'conflict-archive');
  const saved = fs.readdirSync(archive, { recursive: true }).filter((name) => String(name).endsWith('-ours.md'));
  assert.ok(saved.length > 0, 'изменённый текст должен остаться в архиве');
});

test('оставить заметку: файл на месте с правками этого устройства', async () => {
  deleteVersusChange('Дела.md');
  const body = await keep('Дела.md', 'ours');
  assert.equal(body.resolved, true);
  assert.equal(body.removed, false);
  assert.equal(fs.readFileSync(path.join(notesDir, 'Дела.md'), 'utf-8'), 'Хлеб.\nСыр.\n');
  const status = await (await fetch(`${base}/api/git/status`)).json();
  assert.notEqual(status.status, 'conflict');
});

test('слияние фиксируется, даже когда итог совпадает с версией этого устройства', async () => {
  // Two conflicts, both resolved "as here": the result equals HEAD, and the merge must still be committed.
  write('Один.md', 'Один.\n'); write('Два.md', 'Два.\n');
  git(['add', '-A']); git(['commit', '-qm', 'two notes']);
  git(['checkout', '-qb', 'other-two']);
  git(['rm', '-q', 'Один.md']); write('Два.md', 'Два — там.\n'); git(['add', '-A']); git(['commit', '-qm', 'there']);
  git(['checkout', '-q', 'master']);
  write('Один.md', 'Один — здесь.\n'); write('Два.md', 'Два — здесь.\n'); git(['commit', '-qam', 'here']);
  try { git(['merge', 'other-two']); } catch { /* conflict expected */ }
  await keep('Один.md', 'ours');
  const body = await fetch(`${base}/api/git/resolve-note`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'notes/Два.md', content: 'Два — здесь.\n' }),
  }).then((r) => r.json());
  assert.equal(body.resolved, true);
  assert.throws(() => git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']), 'слияние должно быть завершено');
  assert.match(git(['log', '-1', '--format=%P']), /^\w+ \w+$/, 'последний коммит — коммит слияния с двумя родителями');
});
