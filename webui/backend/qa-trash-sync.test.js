import test from 'node:test';
import assert from 'node:assert/strict';
import { connectLocal, makeBareRemote, startDevice } from './support/two-devices.js';

// J2: a deletion travels through git. The note moves into `.trash/` on the device that deleted it, and every other
// device, and a clone made later, finds it in the trash instead of in the live notes.
test('удаление доходит до других устройств через git, восстановление тоже, а новый клон видит корзину', { timeout: 180000 }, async () => {
  const { remote, cleanup } = makeBareRemote();
  const a = await startDevice('Ноутбук');
  const b = await startDevice('Телефон');
  let c = null;
  try {
    await connectLocal(a, remote, { first: true });
    await connectLocal(b, remote);
    const sync = async (device) => {
      const result = await device.post('/api/git/sync');
      assert.equal(result.status, 200, `${device.name}: ${JSON.stringify(result.data)}`);
    };
    const trashed = async (device) => (await device.get('/api/notes/trash')).data.map((note) => note.path);
    const board = async (device) => (await device.get('/api/notes/recent?limit=100')).data.map((note) => note.path);

    assert.equal((await a.post('/api/notes/create', { title: 'Общая', content: 'текст\n' })).status, 200);
    await sync(a);
    await sync(b);
    assert.ok(b.exists('Общая.md'));

    const del = await fetch(`${a.base}/api/file?path=${encodeURIComponent('notes/Общая.md')}`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    assert.ok(a.exists('.trash/Общая.md'));
    await sync(a);
    await sync(b);

    assert.equal(b.exists('Общая.md'), false, 'the deletion arrived: the note is not live on the other device');
    assert.ok(b.exists('.trash/Общая.md'), 'it rests in the trash there');
    assert.deepEqual(await trashed(b), ['notes/Общая.md']);
    assert.ok(!(await board(b)).includes('notes/Общая.md'));
    assert.equal((await b.get('/api/file?path=' + encodeURIComponent('notes/Общая.md'))).status, 410);

    // A device that connects later sees the trash as well.
    c = await startDevice('Планшет');
    await connectLocal(c, remote);
    // The app reads the whole folder when it starts; here the backend started before the clone, so it is asked to.
    await c.post('/api/directory/create?path=Scratch');
    assert.deepEqual(await trashed(c), ['notes/Общая.md'], 'a fresh clone shows the note in the trash');
    assert.ok(!(await board(c)).includes('notes/Общая.md'));

    // Restoring on B travels back.
    const restored = await b.post('/api/notes/restore?path=' + encodeURIComponent('notes/Общая.md'));
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    await sync(b);
    await sync(a);
    assert.ok(a.exists('Общая.md'), 'the note is live on A again');
    assert.equal(a.exists('.trash/Общая.md'), false);
    assert.deepEqual(await trashed(a), []);
    assert.ok((await board(a)).includes('notes/Общая.md'));
  } finally {
    await a.stop();
    await b.stop();
    if (c) await c.stop();
    cleanup();
  }
});
