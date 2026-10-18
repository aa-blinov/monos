import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { referencedAttachments } from './export-bundle.js';

test('referencedAttachments: берёт только файлы из _attachments, на которые ссылается текст', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-bundle-'));
  for (const name of ['a b.png', 'doc.pdf', 'unused.png']) fs.writeFileSync(path.join(dir, name), 'x');
  const text = '![](_attachments/a%20b.png)\n\n![[doc.pdf]]\n\n![](_attachments/missing.png)\n\n[[Some note]]';
  assert.deepEqual(referencedAttachments(text, dir).sort(), ['a b.png', 'doc.pdf']);
  assert.deepEqual(referencedAttachments('![](_attachments/../x.png)', dir), []);
  assert.deepEqual(referencedAttachments('text', path.join(dir, 'none')), []);
  void AdmZip;
});

test('referencedAttachments: ссылка-симлинк в _attachments не выносит чужой файл в экспорт', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-bundle-link-'));
  const outside = path.join(dir, 'secret.txt');
  fs.writeFileSync(outside, 'secret');
  const attachments = path.join(dir, '_attachments');
  fs.mkdirSync(attachments);
  fs.symlinkSync(outside, path.join(attachments, 'a.png'));
  fs.writeFileSync(path.join(attachments, 'ok.png'), 'x');
  assert.deepEqual(referencedAttachments('![](_attachments/a.png) ![](_attachments/ok.png)', attachments), ['ok.png']);
});

test('referencedAttachments: `my_attachments/` и чужие адреса не считаются, а длинный текст из [[ не вешает разбор', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-bundle-re-'));
  fs.writeFileSync(path.join(dir, 'a.png'), 'x');
  assert.deepEqual(referencedAttachments('![](my_attachments/a.png)', dir), []);
  const started = Date.now();
  referencedAttachments('[['.repeat(40000), dir);
  assert.ok(Date.now() - started < 300);
});
