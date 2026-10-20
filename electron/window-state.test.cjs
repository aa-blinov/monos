const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readWindowState, writeWindowState, boundsOnScreen, MIN_WIDTH } = require('./window-state.cjs');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'monos-window-state-'));
}

test('окно возвращается на своё место', () => {
  const dir = tempDir();
  writeWindowState(dir, { width: 1440, height: 900, x: 120, y: 60 });
  assert.deepEqual(readWindowState(dir), { width: 1440, height: 900, x: 120, y: 60 });
});

test('битое состояние не ломает запуск — окно просто откроется обычным', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'window-state.json'), '{не json');
  assert.equal(readWindowState(dir), null);
});

test('состояние без файла — это null, а не выдуманный размер', () => {
  assert.equal(readWindowState(tempDir()), null);
});

test('окно уже минимального размера не восстанавливается', () => {
  const dir = tempDir();
  writeWindowState(dir, { width: 10, height: 10, x: 0, y: 0 });
  assert.equal(readWindowState(dir), null);
  writeWindowState(dir, { width: MIN_WIDTH, height: 700, x: 0, y: 0 });
  assert.equal(readWindowState(dir).width, MIN_WIDTH);
});

test('окно на ушедшем мониторе не возвращается — там его не достанть', () => {
  const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];
  assert.equal(boundsOnScreen({ x: 100, y: 100, width: 800, height: 600 }, displays), true);
  assert.equal(boundsOnScreen({ x: 3000, y: 100, width: 800, height: 600 }, displays), false);
  assert.equal(boundsOnScreen({ x: 100, y: 100, width: 800, height: 600 }, []), false);
});
