import test from 'node:test';
import assert from 'node:assert/strict';
import { listenForNoteChanges } from './notes-events.js';

test('изменения извне доходят до приложения, мусор в потоке игнорируется', () => {
  const seen = [];
  const announced = [];
  globalThis.window = { dispatchEvent: (e) => announced.push(e.type) };
  globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
  let instance;
  class FakeSource { constructor(url) { this.url = url; instance = this; } close() { this.closed = true; } }
  const stop = listenForNoteChanges({ onFiles: (paths) => seen.push(paths), EventSourceImpl: FakeSource });
  assert.equal(instance.url, '/api/events');
  instance.onmessage({ data: '{"type":"files","paths":["notes/А.md"]}' });
  instance.onmessage({ data: 'не json' });
  instance.onmessage({ data: '{"type":"other"}' });
  assert.deepEqual(seen, [['notes/А.md']]);
  assert.deepEqual(announced, ['monos:notes-pulled']);
  stop();
  assert.equal(instance.closed, true);
});

test('без EventSource (тесты, старые среды) ничего не происходит', () => {
  const stop = listenForNoteChanges({ EventSourceImpl: undefined });
  assert.equal(typeof stop, 'function');
});
