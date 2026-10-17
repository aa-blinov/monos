import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The index is kept in step with the folder without reading every note again: a file is skipped when the index
// already holds it, a pull or an agent's edit updates only the files it touched, and the text index (deleted by
// rowid, never by scanning) comes back whole when it has fallen out of step.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-incremental-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;

const { getDb } = await import('./database.js');
const { indexAllFiles, indexPaths } = await import('./indexing.js');
const { ftsInSync, pathsMentioning } = await import('./fts.js');
const { searchEntries } = await import('./search.js');

const write = (name, text) => {
  const full = path.join(notesDir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, 'utf-8');
  return full;
};
const row = (relative) => getDb().prepare('SELECT * FROM notes_index WHERE path = ?').get(`notes/${relative}`);
const found = (query) => {
  const entries = getDb().prepare('SELECT * FROM notes_index WHERE is_dir = 0').all();
  return searchEntries(entries, { query, searchContent: true }).map((item) => item.path);
};
const ftsPaths = () => getDb().prepare('SELECT path FROM notes_fts').all().map((r) => r.path).sort();

test.before(() => {
  write('Первая.md', 'про яблоки и груши\n');
  write('Работа/План.md', 'квартальный план работ\n');
  write('Работа/Идеи.md', 'идея про рыбалку\n');
  indexAllFiles();
});

test('первый обход заполняет индекс и текстовый индекс, и они сходятся', () => {
  assert.ok(row('Первая.md') && row('Работа/План.md'));
  assert.equal(row('Работа').is_dir, 1);
  assert.equal(ftsInSync(getDb()), true);
  assert.deepEqual(found('яблоки'), ['notes/Первая.md']);
});

test('второй обход ничего не переписывает: время открытия и строка остаются', () => {
  const db = getDb();
  db.prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?').run('2001-01-01T00:00:00.000Z', 'notes/Первая.md');
  indexAllFiles();
  assert.equal(row('Первая.md').last_opened, '2001-01-01T00:00:00.000Z');
});

test('indexPaths обновляет только названные файлы, остальные не трогает', () => {
  const touched = write('Первая.md', 'теперь про бананы\n');
  write('Работа/Идеи.md', 'идея про охоту\n'); // changed on disk, but not named below
  indexPaths([touched]);
  assert.deepEqual(found('бананы'), ['notes/Первая.md']);
  assert.deepEqual(found('яблоки'), [], 'старый текст ушёл из поиска');
  assert.deepEqual(found('рыбалку'), ['notes/Работа/Идеи.md'], 'файл, которого не называли, остался прежним');
});

test('новая папка с заметкой: строка папки создаётся, заметка находится', () => {
  const created = write('Новая/Глубже/Запись.md', 'письмо про самолёт\n');
  indexPaths([created]);
  assert.equal(row('Новая').is_dir, 1);
  assert.equal(row('Новая/Глубже').is_dir, 1);
  assert.deepEqual(found('самолёт'), ['notes/Новая/Глубже/Запись.md']);
});

test('удалённый файл и удалённая папка уходят из индекса и из поиска', () => {
  fs.rmSync(path.join(notesDir, 'Первая.md'));
  fs.rmSync(path.join(notesDir, 'Новая'), { recursive: true });
  indexPaths([path.join(notesDir, 'Первая.md'), path.join(notesDir, 'Новая')]);
  assert.equal(row('Первая.md'), undefined);
  assert.equal(row('Новая'), undefined);
  assert.equal(row('Новая/Глубже/Запись.md'), undefined);
  assert.deepEqual(found('бананы'), []);
  assert.deepEqual(found('самолёт'), []);
  assert.equal(ftsInSync(getDb()), true);
  assert.deepEqual(ftsPaths(), ['notes/Работа/Идеи.md', 'notes/Работа/План.md']);
});

test('заметка под скрытой папкой не становится заметкой', () => {
  const hidden = write('_архив/Старое.md', 'спрятанное\n');
  indexPaths([hidden]);
  assert.equal(row('_архив/Старое.md'), undefined);
});

test('повторная запись той же заметки не плодит строк в текстовом индексе', () => {
  const full = write('Работа/План.md', 'квартальный план работ, дополнено\n');
  indexPaths([full]);
  indexPaths([full]);
  assert.equal(ftsPaths().filter((p) => p === 'notes/Работа/План.md').length, 1);
});

test('текстовый индекс, потерявший соответствие, достраивается при следующем обходе', () => {
  const db = getDb();
  db.exec('DELETE FROM notes_fts');
  db.exec('DELETE FROM notes_fts_ids');
  assert.equal(ftsInSync(db), false);
  indexAllFiles();
  assert.equal(ftsInSync(db), true);
  assert.deepEqual(found('охоту'), ['notes/Работа/Идеи.md'], 'и поиск снова находит заметки: полный обход подобрал и файл, изменённый мимо индекса');
  // an index from before the rowid map existed: rows with no map entries
  db.exec('DELETE FROM notes_fts_ids');
  assert.equal(ftsInSync(db), false, 'без справочника индекс не считается сошедшимся');
  indexAllFiles();
  assert.equal(ftsInSync(db), true);
});

test('pathsMentioning отдаёт заметки, где фраза может быть, и null, когда индекс не отвечает', () => {
  const db = getDb();
  assert.deepEqual(pathsMentioning(db, ['Квартальный план']), ['notes/Работа/План.md']);
  assert.equal(pathsMentioning(db, ['ab']), null, 'фраза короче триграммы индексом не выразима');
  db.exec('DELETE FROM notes_fts');
  assert.equal(pathsMentioning(db, ['план']), null, 'рассинхронизированный индекс не отвечает');
  indexAllFiles();
});
