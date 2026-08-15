import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_LINK_DRAG_TYPE, noteLinkLabel, noteLinkPayload, wikiLinkForNote } from './drag-data.js';

test('NOTE_LINK_DRAG_TYPE — стабильная константа для drag-n-drop контракта', () => {
  assert.equal(NOTE_LINK_DRAG_TYPE, 'application/x-monos-note-link');
});

test('noteLinkLabel: приоритет name над path, strip .md', () => {
  assert.equal(noteLinkLabel({ name: 'My Note', path: 'a/b/My Note.md' }), 'My Note');
  assert.equal(noteLinkLabel({ path: 'a/b/Other.md' }), 'Other');
  assert.equal(noteLinkLabel({}), '');
});

test('noteLinkPayload собирает path + label', () => {
  const note = { name: 'Plan', path: 'notes/Work/Plan.md' };
  assert.deepEqual(noteLinkPayload(note), { path: 'notes/Work/Plan.md', name: 'Plan' });
  // пустой/безымянный note → пустой payload
  assert.deepEqual(noteLinkPayload({}), { path: '', name: '' });
  assert.deepEqual(noteLinkPayload(null), { path: '', name: '' });
});

test('wikiLinkForNote формирует [[Title]]', () => {
  assert.equal(wikiLinkForNote({ name: 'Plan', path: 'Work/Plan.md' }), '[[Plan]]');
  assert.equal(wikiLinkForNote({}), '');
});
