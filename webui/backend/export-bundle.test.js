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
