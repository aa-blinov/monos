import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.NOTES_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-quotepath-'));
const { gitEnv } = await import('./routes/git.js');

test('git с окружением Monos отдаёт русские имена файлов как есть, а не \\320\\237…', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-quotepath-repo-'));
  const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf-8', env: gitEnv('') }).trim();
  git(['init', '-q']);
  fs.writeFileSync(path.join(repo, 'План поездки.md'), 'x');
  const status = git(['status', '--porcelain']);
  assert.match(status, /План поездки\.md/);
  assert.doesNotMatch(status, /\\3\d\d/);
});
