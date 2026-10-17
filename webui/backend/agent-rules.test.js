import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The files an agent reads before working in the notes folder: created on request, never overwritten, and
// never shown as notes.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-agent-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;
const { startServer, stopServer } = await import('./index.js');
let base;

test.before(async () => {
  fs.writeFileSync(path.join(notesDir, 'CLAUDE.md'), 'Свои правила.\n', 'utf-8');
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
});
test.after(async () => { await stopServer(); });

test('правила создаются, а уже написанные человеком не перезаписываются', async () => {
  const before = await (await fetch(`${base}/api/agent/rules`)).json();
  assert.deepEqual(before, { 'AGENTS.md': false, 'CLAUDE.md': true, 'GEMINI.md': false });
  const body = await (await fetch(`${base}/api/agent/rules`, { method: 'POST' })).json();
  assert.deepEqual(body.created.sort(), ['AGENTS.md', 'GEMINI.md']);
  assert.equal(fs.readFileSync(path.join(notesDir, 'CLAUDE.md'), 'utf-8'), 'Свои правила.\n');
  assert.match(fs.readFileSync(path.join(notesDir, 'AGENTS.md'), 'utf-8'), /monos-locked: true/);
  assert.equal(fs.readFileSync(path.join(notesDir, 'GEMINI.md'), 'utf-8'), '@AGENTS.md\n');
});

test('файлы правил не попадают в заметки', async () => {
  const tree = JSON.stringify(await (await fetch(`${base}/api/tree`)).json());
  assert.doesNotMatch(tree, /AGENTS\.md|CLAUDE\.md|GEMINI\.md/);
});
