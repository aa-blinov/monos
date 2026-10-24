import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootVault } from './support/vault.js';

// B5 (zip size caps), B6 (publish keeps the old site), B7 and B14 (HTML from notes is filtered), B15 (import is
// validated first and is all or nothing).
const vault = await bootVault({
  files: {
    'Welcome.md': '# Welcome\n\nhello\n',
    'Xss.md': [
      '# Xss', '',
      '[c1](&#106;avascript:alert(3))', '',
      '[c2](java&#x09;script:alert(4))', '',
      '[c3](JaVaScRiPt:alert(1))', '',
      '<a href="javascript:alert(5)">raw</a> <img src=x onerror=alert(6)> <script>alert(7)</script>', '',
      '[ok](https://example.com/page) [rel](Welcome.md) [mail](mailto:a@b.c) [anchor](#x)', '',
      '![d](data:text/html;base64,AAAA)', '',
    ].join('\n'),
  },
});
after(() => vault.stop());

const q = (relative) => ({ query: { path: relative } });
const upload = (buffer, name = 'in.zip') => {
  const form = new FormData();
  form.append('archive', new Blob([buffer], { type: 'application/zip' }), name);
  return fetch(`${vault.base}/api/backup/import`, { method: 'POST', body: form });
};
const decodedHrefs = (html) => [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((match) => match[1]);
const noScriptInHtml = (html, label) => {
  assert.doesNotMatch(html, /<script|<[a-z][^>]*\son\w+\s*=/i, `${label}: no active markup`);
  for (const value of decodedHrefs(html)) {
    const plain = value.replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec))).replace(/[\s\u0000-\u001f]/g, '');
    assert.doesNotMatch(plain, /^(javascript|vbscript|data):/i, `${label}: ${value}`);
  }
};

test('B5: an archive that unpacks to more than the cap is refused before anything is read', async () => {
  const zip = new AdmZip();
  // 25 MB of one letter is a few kilobytes of zip: the shape of the QA repro, smaller.
  zip.addFile('Huge.md', Buffer.alloc(25 * 1024 * 1024, 97));
  const compressed = zip.toBuffer();
  assert.ok(compressed.length < 200 * 1024, `the archive is small (${compressed.length} bytes)`);
  const started = Date.now();
  const response = await upload(compressed);
  assert.equal(response.status, 413);
  const body = await response.json();
  assert.equal(body.code, 'archive_entry_too_large');
  assert.ok(Date.now() - started < 3000, 'and it was refused at once');
  assert.equal(vault.exists('Huge.md'), false);
  assert.equal((await vault.get('/health')).status, 200);
});

test('B5: a header that understates the size cannot make the importer read more than it declared', async () => {
  const zip = new AdmZip();
  zip.addFile('Liar.md', Buffer.alloc(1024 * 1024, 98));
  const bytes = zip.toBuffer();
  // The central directory says 100 bytes; the data inflates to a megabyte.
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(100, central + 24);
  const response = await upload(bytes);
  assert.ok([400, 413].includes(response.status), `status ${response.status}`);
  assert.equal(vault.exists('Liar.md'), false);
  assert.equal((await vault.get('/health')).status, 200);
});

test('B15: a file that is not a ZIP is a 400, with a plain message', async () => {
  const response = await upload(Buffer.from('this is not a zip file at all'));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'invalid_archive');
  assert.doesNotMatch(body.detail, /ADM-ZIP/);
});

test('B15: entries the system cannot make are named and left out, the rest are imported', async () => {
  const zip = new AdmZip();
  zip.addFile('Good/Fine.md', Buffer.from('# fine\n'));
  zip.addFile('con.md', Buffer.from('# reserved\n'));
  zip.addFile('a:b.md', Buffer.from('# colon\n'));
  zip.addFile('trail. /x.md', Buffer.from('# trailing\n'));
  zip.addFile(`${'n'.repeat(300)}.md`, Buffer.from('# long\n'));
  zip.addFile('Welcome.md/inner.md', Buffer.from('# in the way\n'));
  const response = await upload(zip.toBuffer());
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.importedNotes, 1, JSON.stringify(summary));
  assert.equal(summary.invalid.length, 5, JSON.stringify(summary));
  assert.ok(summary.invalid.every((item) => typeof item.name === 'string' && typeof item.reason === 'string'));
  assert.ok(vault.exists('Good/Fine.md'));
  assert.equal(vault.exists('con.md'), false);
  assert.equal(vault.read('Welcome.md'), '# Welcome\n\nhello\n', 'the note that was in the way is untouched');
  assert.ok(!JSON.stringify(summary).includes(vault.root));
});

test('B15: an import that fails on the way takes back what it wrote', { skip: process.getuid?.() === 0 }, async () => {
  const locked = path.join(vault.notesDir, 'Locked');
  fs.mkdirSync(locked);
  fs.chmodSync(locked, 0o555);
  try {
    const zip = new AdmZip();
    zip.addFile('First written.md', Buffer.from('# one\n'));
    zip.addFile('Fresh/Also.md', Buffer.from('# two\n'));
    zip.addFile('Locked/Cannot.md', Buffer.from('# three\n'));
    const response = await upload(zip.toBuffer());
    assert.ok(response.status >= 400, `status ${response.status}`);
    const body = await response.json();
    assert.equal(typeof body.code, 'string');
    assert.ok(!JSON.stringify(body).includes(vault.root));
    assert.equal(vault.exists('First written.md'), false, 'nothing of the import is left');
    assert.equal(vault.exists('Fresh'), false, 'and no folder it made');
  } finally {
    fs.chmodSync(locked, 0o755);
  }
});

test('B7: a published page carries no script, handler or script link', async () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-site-'));
  try {
    const published = await vault.post('/api/publish', { body: { target } });
    assert.equal(published.status, 200, JSON.stringify(published.data));
    const html = fs.readFileSync(path.join(target, 'monos-site', 'pages', 'Xss.html'), 'utf-8');
    noScriptInHtml(html, 'published');
    assert.match(html, /<a href="https:\/\/example\.com\/page"/, 'a web link stays');
    assert.match(html, /mailto:a@b\.c/);
    assert.match(html, /http-equiv="Content-Security-Policy"/, 'and the page forbids scripts on its own');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('B14: the print page filters the note, forbids scripts and is not sniffed', async () => {
  const response = await vault.get('/api/print/note', q('notes/Xss.md'));
  assert.equal(response.status, 200);
  noScriptInHtml(response.text, 'print');
  assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  assert.doesNotMatch(response.headers['content-security-policy'], /script-src[^;]*'unsafe/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.match(response.text, /alert\(7\)/, 'the text of the script is shown as text');
  const book = await vault.get('/api/print/tree', q(''));
  assert.equal(book.status, 200);
  noScriptInHtml(book.text, 'print book');
  assert.equal(book.headers['x-content-type-options'], 'nosniff');
});

test('B6: a site that cannot be built does not take the published one away', { skip: process.getuid?.() === 0 }, async () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-site-keep-'));
  try {
    assert.equal((await vault.post('/api/publish', { body: { target } })).status, 200);
    const before = fs.readFileSync(path.join(target, 'monos-site', 'index.html'), 'utf-8');
    fs.chmodSync(target, 0o555);
    const failed = await vault.post('/api/publish', { body: { target } });
    fs.chmodSync(target, 0o755);
    assert.ok(failed.status >= 400);
    assert.equal(fs.readFileSync(path.join(target, 'monos-site', 'index.html'), 'utf-8'), before, 'the old site is still there');
    assert.deepEqual(fs.readdirSync(target), ['monos-site'], 'and no half-built folder was left');
  } finally {
    fs.chmodSync(target, 0o755);
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('B6: a note the renderer cannot take is left out and named, and the site is still made', async () => {
  vault.write('Giant.md', `# Giant\n\n${'word '.repeat(500_000)}\n`);
  vault.write('Deep.md', `${'> '.repeat(40000)}text\n`);
  await vault.post('/api/directory/create', q('Poke'));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-site-big-'));
  try {
    const published = await vault.post('/api/publish', { body: { target } });
    assert.equal(published.status, 200, JSON.stringify(published.data).slice(0, 200));
    assert.ok(published.data.pages >= 2);
    const skipped = Object.fromEntries(published.data.skipped.map((item) => [item.path, item.reason]));
    assert.equal(skipped['notes/Giant.md'], 'too_large');
    assert.ok(fs.existsSync(path.join(target, 'monos-site', 'index.html')));
    assert.equal(fs.existsSync(path.join(target, 'monos-site', 'pages', 'Giant.html')), false);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
