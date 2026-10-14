import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLUSH_OPEN_NOTE_EVENT,
  NOTE_LINKS_UPDATED_EVENT,
  announceNoteLinksUpdated,
  flushOpenNote,
} from './note-refresh.js';

// The module talks to `window`; an EventTarget stands in for it under Node.
globalThis.window = new EventTarget();

test('flushOpenNote ждёт сохранение, которое объявил открытый редактор', async () => {
  let saved = false;
  const listener = (event) => {
    event.detail.pending.push(new Promise((resolve) => setTimeout(() => {
      saved = true;
      resolve();
    }, 5)));
  };
  window.addEventListener(FLUSH_OPEN_NOTE_EVENT, listener);
  try {
    await flushOpenNote();
    assert.equal(saved, true);
  } finally {
    window.removeEventListener(FLUSH_OPEN_NOTE_EVENT, listener);
  }
});

test('flushOpenNote без открытой заметки завершается сразу', async () => {
  await flushOpenNote();
});

test('announceNoteLinksUpdated сообщает о переписанных и необновлённых заметках, без изменений молчит', () => {
  const received = [];
  const listener = (event) => received.push(event.detail);
  window.addEventListener(NOTE_LINKS_UPDATED_EVENT, listener);
  try {
    announceNoteLinksUpdated({ updatedLinks: 0, updatedPaths: [] });
    announceNoteLinksUpdated({ updatedLinks: 2, updatedPaths: ['notes/A.md'] });
    announceNoteLinksUpdated({ updatedLinks: 0, updatedPaths: [], failedPaths: ['notes/B.md'] });
    assert.deepEqual(received, [
      { updatedLinks: 2, updatedPaths: ['notes/A.md'], failedPaths: [] },
      { updatedLinks: 0, updatedPaths: [], failedPaths: ['notes/B.md'] },
    ]);
  } finally {
    window.removeEventListener(NOTE_LINKS_UPDATED_EVENT, listener);
  }
});
