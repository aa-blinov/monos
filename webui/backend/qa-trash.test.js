import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { bootVault } from './support/vault.js';

// B4 / J2: the trash and the icons and colours of folders live in files, not in the index; B3: a folder goes to the
// trash; B-J7: a note in the trash does not take its name. Each test names the QA defect it keeps shut.
const vault = await bootVault({
  files: {
    'Proj/Plan.md': '---\ntitle: "Plan"\n---\n\nПлан с [[Beta]] и картинкой ![pic](_attachments/pic.png)\n',
    'Proj/_attachments/pic.png': 'png-bytes',
    'Proj/Other.md': '# Other\n\nbody\n',
    'Beta.md': '# Beta\n\nBeta body\n',
    'Solo.md': '# Solo\n\nsolo body\n',
  },
});
after(() => vault.stop());

const { getDb, closeDb } = await import('./database.js');
const { indexAllFiles } = await import('./indexing.js');
const q = (relative) => ({ query: { path: relative } });
const trashList = async () => (await vault.get('/api/notes/trash')).data;
const recentPaths = async () => (await vault.get('/api/notes/recent', { query: { limit: 100 } })).data.map((note) => note.path);

// What the index would be after deleting notes.db: a new connection on a new file, filled from the folder.
function loseIndex() {
  closeDb();
  for (const name of fs.readdirSync(path.join(vault.root, '.data'))) {
    if (/^notes.*\.db/.test(name)) fs.rmSync(path.join(vault.root, '.data', name), { force: true });
  }
  indexAllFiles();
}

test('B4: a deleted note moves into .trash with a sidecar, and the answers keep their shape', async () => {
  const deleted = await vault.del('/api/file', q('notes/Solo.md'));
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.message, 'Moved to trash');
  assert.ok(deleted.data.trashedAt);
  assert.equal(vault.exists('Solo.md'), false, 'the note is not in the notes folder any more');
  assert.equal(vault.exists('.trash/Solo.md'), true, 'it rests in .trash');
  const sidecar = JSON.parse(vault.read('.trash/Solo.md.trash.json'));
  assert.equal(sidecar.originalPath, 'Solo.md');
  assert.equal(sidecar.trashedAt, deleted.data.trashedAt);

  const info = await vault.get('/api/file-info', q('notes/Solo.md'));
  assert.equal(info.status, 410, 'a note in the trash answers gone, as before');
  assert.equal(info.data.code, 'trashed');
  assert.equal((await vault.get('/api/file', q('notes/Solo.md'))).status, 410);

  const list = await trashList();
  const entry = list.find((item) => item.path === 'notes/Solo.md');
  assert.ok(entry, 'the trash list names the note by the place it was deleted from');
  assert.equal(entry.trashPath, 'notes/.trash/Solo.md');
  assert.equal(entry.trashedAt, deleted.data.trashedAt);
  assert.ok(!(await recentPaths()).includes('notes/Solo.md'));
  const tree = JSON.stringify((await vault.get('/api/tree')).data);
  assert.ok(!tree.includes('Solo.md') && !tree.includes('.trash'));
});

test('B4: rebuilding the index loses neither the trash nor its dates', async () => {
  const before = (await trashList()).find((item) => item.path === 'notes/Solo.md');
  loseIndex();
  const after = (await trashList()).find((item) => item.path === 'notes/Solo.md');
  assert.ok(after, 'the note is still in the trash after the index was thrown away');
  assert.equal(after.trashedAt, before.trashedAt, 'and was deleted at the same time');
  assert.ok(!(await recentPaths()).includes('notes/Solo.md'), 'and does not turn up on the board');
});

test('J2: git sees the deletion as a move out of the live folder, and a trashed note is not tracked as live', async () => {
  const { execFileSync } = await import('node:child_process');
  const git = (...args) => execFileSync('git', args, { cwd: vault.notesDir, encoding: 'utf-8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 't@example.test');
  git('config', 'user.name', 'T');
  git('add', '-A');
  const tracked = git('ls-files').split('\n');
  assert.ok(tracked.includes('.trash/Solo.md'), 'the trash travels with the repository');
  assert.ok(!tracked.includes('Solo.md'), 'the deleted note is not a live file of the repository');
});

test('B4: restore returns the note to where it was, by either path, and the board sees it', async () => {
  const restored = await vault.post('/api/notes/restore', q('notes/Solo.md'));
  assert.equal(restored.status, 200);
  assert.equal(restored.data.path, 'notes/Solo.md');
  assert.equal(vault.exists('Solo.md'), true);
  assert.equal(vault.exists('.trash/Solo.md'), false);
  assert.equal(vault.exists('.trash/Solo.md.trash.json'), false, 'the sidecar goes with it');
  assert.ok((await recentPaths()).includes('notes/Solo.md'));
  assert.equal((await vault.get('/api/file-info', q('notes/Solo.md'))).status, 200);
  // Undoing twice is not an error.
  assert.equal((await vault.post('/api/notes/restore', q('notes/Solo.md'))).status, 200);

  // By the path in the trash itself.
  await vault.del('/api/file', q('notes/Solo.md'));
  const byTrashPath = await vault.post('/api/notes/restore', q('notes/.trash/Solo.md'));
  assert.equal(byTrashPath.status, 200);
  assert.equal(byTrashPath.data.path, 'notes/Solo.md');
});

test('B4: a note deleted from a folder comes back to the folder, which is made again when it is gone', async () => {
  await vault.del('/api/file', q('notes/Proj/Other.md'));
  fs.rmSync(path.join(vault.notesDir, 'Proj', '_attachments'), { recursive: true });
  fs.rmSync(path.join(vault.notesDir, 'Proj', 'Plan.md'));
  fs.rmdirSync(path.join(vault.notesDir, 'Proj'));
  indexAllFiles();
  assert.equal(vault.exists('Proj'), false);
  const restored = await vault.post('/api/notes/restore', q('notes/Proj/Other.md'));
  assert.equal(restored.status, 200);
  assert.equal(restored.data.path, 'notes/Proj/Other.md');
  assert.equal(vault.exists('Proj/Other.md'), true);
  const tree = JSON.stringify((await vault.get('/api/tree')).data);
  assert.ok(tree.includes('"path":"notes/Proj"'), 'the folder is in the tree again');
  // Put the rest back for the later tests.
  vault.write('Proj/Plan.md', '---\ntitle: "Plan"\n---\n\nПлан с [[Beta]] и картинкой ![pic](_attachments/pic.png)\n');
  vault.write('Proj/_attachments/pic.png', 'png-bytes');
  indexAllFiles();
});

test('B4: restoring over a name that is taken again never replaces the live note', async () => {
  await vault.del('/api/file', q('notes/Solo.md'));
  const created = await vault.post('/api/notes/create', { body: { title: 'Solo', content: 'the new one' } });
  assert.equal(created.status, 200, 'B-J7: a note in the trash does not block its name');
  assert.equal(created.data.path, 'notes/Solo.md');
  const restored = await vault.post('/api/notes/restore', q('notes/Solo.md'));
  assert.equal(restored.status, 200);
  assert.equal(restored.data.path, 'notes/Solo (restored).md');
  assert.equal(restored.data.renamed, true);
  assert.match(vault.read('Solo.md'), /the new one/, 'the live note keeps its text');
  assert.match(vault.read('Solo (restored).md'), /solo body/);
});

test('B4: two notes deleted from the same place are two entries, each restorable on its own', async () => {
  vault.write('Twin.md', '# one\n');
  indexAllFiles();
  await vault.del('/api/file', q('notes/Twin.md'));
  vault.write('Twin.md', '# two\n');
  indexAllFiles();
  await vault.del('/api/file', q('notes/Twin.md'));
  const twins = (await trashList()).filter((item) => /^notes\/Twin/.test(item.path));
  assert.equal(twins.length, 2);
  assert.equal(new Set(twins.map((item) => item.path)).size, 2, 'the list never repeats a path');
  const newest = twins.find((item) => item.path === 'notes/Twin.md');
  assert.ok(newest, 'the later deletion keeps the name it was deleted under (an undo finds it)');
  const restored = await vault.post('/api/notes/restore', q('notes/Twin.md'));
  assert.match(vault.read(restored.data.path.replace(/^notes\//, '')), /two/);
  const older = twins.find((item) => item.path !== 'notes/Twin.md');
  const back = await vault.post('/api/notes/restore', q(older.path));
  assert.equal(back.status, 200);
  assert.match(vault.read(back.data.path.replace(/^notes\//, '')), /one/);
});

test('B-J7: creating or renaming to the name of a trashed note works, and nothing live is replaced', async () => {
  vault.write('Ghost.md', '# ghost\n');
  indexAllFiles();
  await vault.del('/api/file', q('notes/Ghost.md'));
  const created = await vault.post('/api/notes/create', { body: { title: 'Ghost' } });
  assert.equal(created.status, 200);
  vault.write('Other name.md', '# x\n');
  indexAllFiles();
  await vault.del('/api/file', q('notes/Ghost.md'));
  const renamed = await vault.post('/api/file/rename', { ...q('notes/Other name.md'), body: { new_name: 'Ghost.md' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.path, 'notes/Ghost.md');
});

test('B4: a trashed note is out of search, tags, backlinks and the link graph, and its picture is not unused', async () => {
  vault.write('Linker.md', '---\ntags: ["t1"]\n---\n\nSee [[Plan]].\n');
  indexAllFiles();
  const backlinks = async () => (await vault.get('/api/notes/backlinks', q('notes/Proj/Plan.md'))).data.map((item) => item.path);
  assert.deepEqual(await backlinks(), ['notes/Linker.md']);
  await vault.del('/api/file', q('notes/Linker.md'));
  assert.deepEqual(await backlinks(), [], 'a trashed note is not a backlink');
  const found = await vault.post('/api/search', { body: { query: 'Linker', search_content: true } });
  assert.ok(!found.data.some((item) => /Linker/.test(item.path)));
  assert.ok(!(await vault.get('/api/tags')).data.includes('t1'));
  await vault.post('/api/notes/restore', q('notes/Linker.md'));

  // Plan.md is the only note that shows pic.png; once it is in the trash the picture must still count as used.
  await vault.del('/api/file', q('notes/Proj/Plan.md'));
  const attachments = (await vault.get('/api/attachments/all')).data.items.find((item) => item.name === 'pic.png');
  assert.ok(attachments.usedBy.length > 0, 'the picture of a trashed note is not offered for deletion');
  assert.ok(attachments.usedBy.every((user) => user.trashed === true));
  const orphans = (await vault.get('/api/attachments/orphans')).data.orphans.map((item) => item.name);
  assert.ok(!orphans.includes('pic.png'));
  await vault.post('/api/notes/restore', q('notes/Proj/Plan.md'));
});

test('B3: deleting a folder moves it to the trash, whole, and its notes come back from there', async () => {
  const deleted = await vault.del('/api/file', q('notes/Proj'));
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.message, 'Moved to trash');
  assert.equal(deleted.data.isDir, true);
  assert.equal(deleted.data.notes, 2);
  assert.equal(vault.exists('Proj'), false);
  const listed = (await trashList()).map((item) => item.path);
  assert.ok(listed.includes('notes/Proj/Plan.md') && listed.includes('notes/Proj/Other.md'));
  assert.ok(vault.exists('.trash/Proj/_attachments/pic.png'), 'the pictures rest beside their notes');

  const restored = await vault.post('/api/notes/restore', q('notes/Proj/Plan.md'));
  assert.equal(restored.status, 200);
  assert.equal(vault.exists('Proj/Plan.md'), true);
  assert.equal(vault.read('Proj/_attachments/pic.png'), 'png-bytes', 'its picture came back with it');
  await vault.post('/api/notes/restore', q('notes/Proj/Other.md'));
  assert.equal(vault.exists('.trash/Proj'), false, 'the trash does not keep empty folders');
});

test('B3: only an explicit permanent flag removes a folder for good', async () => {
  vault.write('Gone/A.md', '# a\n');
  indexAllFiles();
  const removed = await vault.del('/api/file', { query: { path: 'notes/Gone', permanent: '1' } });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.message, 'Deleted');
  assert.equal(vault.exists('Gone'), false);
  assert.equal(vault.exists('.trash/Gone'), false);
});

test('B4: deleting from the trash page removes the file and its sidecar, and the entry', async () => {
  vault.write('Bye.md', '# bye\n');
  indexAllFiles();
  await vault.del('/api/file', q('notes/Bye.md'));
  const forever = await vault.del('/api/file', { query: { path: 'notes/Bye.md', permanent: '1' } });
  assert.equal(forever.status, 200);
  assert.equal(vault.exists('.trash/Bye.md'), false);
  assert.equal(vault.exists('.trash/Bye.md.trash.json'), false);
  assert.ok(!(await trashList()).some((item) => item.path === 'notes/Bye.md'));
});

test('B4: permanent from the trash page takes the trashed note, not the live one with the same name', async () => {
  vault.write('Same.md', '# first\n');
  indexAllFiles();
  await vault.del('/api/file', q('notes/Same.md'));
  vault.write('Same.md', '# second, live\n');
  indexAllFiles();
  await vault.del('/api/file', { query: { path: 'notes/Same.md', permanent: '1', trashed: '1' } });
  assert.match(vault.read('Same.md'), /second, live/, 'the live note is still there');
  assert.ok(!(await trashList()).some((item) => item.path === 'notes/Same.md'));
});

test('B4: folder icons and colours live in a file and survive a lost index, a rename and a move', async () => {
  vault.write('Styled/Note.md', '# s\n');
  indexAllFiles();
  const saved = await vault.post('/api/directory/icon', { ...q('notes/Styled'), body: { icon: 'rocket', color: '#fabd2f' } });
  assert.equal(saved.status, 200);
  const file = JSON.parse(vault.read('.monos/folders.json'));
  assert.deepEqual(file.items.Styled, { icon: 'rocket', color: '#fabd2f' });

  loseIndex();
  const tree = (await vault.get('/api/tree')).data;
  const styled = tree.children.find((child) => child.path === 'notes/Styled');
  assert.equal(styled.icon, 'rocket');
  assert.equal(styled.color, '#fabd2f');

  const renamed = await vault.post('/api/file/rename', { ...q('notes/Styled'), body: { new_name: 'Styled2' } });
  assert.equal(renamed.status, 200);
  assert.deepEqual(JSON.parse(vault.read('.monos/folders.json')).items.Styled2, { icon: 'rocket', color: '#fabd2f' });
  assert.equal(JSON.parse(vault.read('.monos/folders.json')).items.Styled, undefined);
  loseIndex();
  const again = (await vault.get('/api/tree')).data.children.find((child) => child.path === 'notes/Styled2');
  assert.equal(again.icon, 'rocket');

  const cleared = await vault.post('/api/directory/icon', { ...q('notes/Styled2'), body: {} });
  assert.equal(cleared.status, 200);
  assert.equal(JSON.parse(vault.read('.monos/folders.json')).items.Styled2, undefined);
});

test('B4: a vault whose icons were only in the index gets the file, and one whose trash was only in the index gets .trash', async () => {
  vault.write('OldTrashed.md', '# old trash\n');
  vault.write('OldFolder/N.md', '# n\n');
  indexAllFiles();
  // How an older version left things: the index alone says "deleted", and the icon is in the table only.
  const db = getDb();
  const stamp = '2026-03-04T05:06:07.000Z';
  db.prepare('UPDATE notes_index SET trashed_at = ? WHERE path = ?').run(stamp, 'notes/OldTrashed.md');
  db.prepare('INSERT OR REPLACE INTO folder_config (path, icon, color) VALUES (?, ?, ?)').run('notes/OldFolder', 'star', '#83a598');
  fs.rmSync(path.join(vault.notesDir, '.monos', 'folders.json'), { force: true });
  // A new start: a new connection, so the one-off migration runs again.
  closeDb();
  indexAllFiles();

  assert.equal(vault.exists('OldTrashed.md'), false, 'the note left the live folder');
  assert.equal(vault.exists('.trash/OldTrashed.md'), true);
  const entry = (await trashList()).find((item) => item.path === 'notes/OldTrashed.md');
  assert.equal(entry.trashedAt, stamp, 'it keeps the time it was deleted at');
  assert.deepEqual(JSON.parse(vault.read('.monos/folders.json')).items.OldFolder, { icon: 'star', color: '#83a598' });
  loseIndex();
  const folder = (await vault.get('/api/tree')).data.children.find((child) => child.path === 'notes/OldFolder');
  assert.equal(folder.icon, 'star');
});

test('B4: the export leaves trashed notes out and carries folder colours, and the import revives nothing', async () => {
  vault.write('Colored/C.md', '# c\n');
  indexAllFiles();
  await vault.post('/api/directory/icon', { ...q('notes/Colored'), body: { color: '#d3869b' } });
  vault.write('Doomed.md', '# doomed\n');
  indexAllFiles();
  await vault.del('/api/file', q('notes/Doomed.md'));

  const exported = await vault.get('/api/backup/export');
  const zip = new AdmZip(exported.buffer);
  const names = zip.getEntries().map((entry) => entry.entryName);
  assert.ok(!names.some((name) => name.includes('Doomed') || name.startsWith('.trash')), 'no trashed note in the export');
  assert.ok(names.includes('Colored/C.md'));
  const styles = JSON.parse(zip.readAsText('monos-folders.json'));
  assert.equal(styles.items.Colored.color, '#d3869b');

  // An archive that carries a .trash folder (from another app, or by hand) brings nothing of it back.
  const incoming = new AdmZip();
  incoming.addFile('.trash/Revived.md', Buffer.from('# revived\n'));
  incoming.addFile('Imported/Fine.md', Buffer.from('# fine\n'));
  incoming.addFile('monos-folders.json', Buffer.from(JSON.stringify({ version: 1, items: { Imported: { icon: 'star', color: '#ff0000' }, '../escape': { icon: 'star' } } })));
  const form = new FormData();
  form.append('archive', new Blob([incoming.toBuffer()], { type: 'application/zip' }), 'in.zip');
  const imported = await fetch(`${vault.base}/api/backup/import`, { method: 'POST', body: form });
  assert.equal(imported.status, 200);
  assert.equal(vault.exists('Revived.md'), false);
  assert.equal(vault.exists('.trash/Revived.md'), false);
  assert.ok(!(await trashList()).some((item) => /Revived/.test(item.path)));
  const imported2 = (await vault.get('/api/tree')).data.children.find((child) => child.path === 'notes/Imported');
  assert.equal(imported2.color, '#ff0000', 'the colour of the folder came with the archive');
});

test('B4: a note put into .trash by hand (or by Obsidian) is a trashed note, dated by its file', async () => {
  vault.write('.trash/Manual.md', '# manual\n');
  indexAllFiles();
  const entry = (await trashList()).find((item) => item.path === 'notes/Manual.md');
  assert.ok(entry, 'the trash list shows it');
  const restored = await vault.post('/api/notes/restore', q('notes/Manual.md'));
  assert.equal(restored.status, 200);
  assert.equal(vault.exists('Manual.md'), true);
});

test('B17 with the trash: a spelling of the path that is not canonical still finds a trashed note', async () => {
  vault.write('Trashme.md', '# t\n');
  indexAllFiles();
  await vault.del('/api/file', q('notes/Trashme.md'));
  for (const spelling of ['notes/./Trashme.md', 'notes/Trashme.md/', './notes/Trashme.md', 'notes//Trashme.md', 'notes/x/../Trashme.md']) {
    const read = await vault.get('/api/file', q(spelling));
    assert.equal(read.status, 410, `GET ${spelling}`);
    const write = await vault.post('/api/file', { ...q(spelling), body: { content: 'overwritten' } });
    assert.equal(write.status, 410, `POST ${spelling}`);
  }
  assert.equal(vault.exists('Trashme.md'), false, 'nothing was written');
});
