import test from 'node:test';
import assert from 'node:assert/strict';
import { clashPath, isTrashedNameClash } from './trashed-clash.js';

test('only a 409 with the trashed code is a clash with the Trash', () => {
  assert.equal(isTrashedNameClash({ status: 409, body: { code: 'trashed' } }), true);
  assert.equal(isTrashedNameClash({ status: 409, body: { code: 'exists' } }), false);
  assert.equal(isTrashedNameClash({ status: 410, body: { code: 'trashed' } }), false);
  assert.equal(isTrashedNameClash(null), false);
  assert.equal(isTrashedNameClash(new Error('x')), false);
});

test('the clashing path is the new name in the same folder', () => {
  assert.equal(clashPath('notes/Work/Old.md', 'New.md'), 'notes/Work/New.md');
  assert.equal(clashPath('notes/Old.md', 'New.md'), 'notes/New.md');
});
