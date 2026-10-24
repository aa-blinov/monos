import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteMarkdown } from './note-markdown.js';

// An editor that is just enough for the writer: top-level nodes, a schema to wrap one in, a serializer.
function fakeEditor(texts) {
  const make = (type, text) => ({
    type: { name: type },
    text,
    content: { size: text.length },
    eq(other) { return other.text === text && other.type.name === type; },
    toJSON() { return { type, text }; },
  });
  let nodes = texts.map((text) => make('paragraph', text));
  const editor = {
    state: { doc: { forEach: (callback) => nodes.forEach((node) => callback(node)) } },
    schema: { topNodeType: { create: (_attrs, children) => ({ children }) } },
    storage: { markdown: { serializer: { serialize: (doc) => `${doc.children[0].text}\n` } } },
    set(next) { nodes = next.map((text) => make('paragraph', text)); },
  };
  return editor;
}

test('an untouched note is written back exactly as it was read', () => {
  const editor = fakeEditor(['one', 'two']);
  const note = createNoteMarkdown(editor);
  note.remember('one\n\n\n\ntwo\n');
  assert.equal(note.serialize(), 'one\n\n\n\ntwo\n');
});

test('a changed block goes through the serializer, the others stay', () => {
  const editor = fakeEditor(['one', 'two']);
  const note = createNoteMarkdown(editor);
  note.remember('one\n\ntwo\n');
  editor.set(['one', 'TWO']);
  assert.equal(note.serialize(), 'one\n\nTWO\n');
});

test('without a source everything is serialized', () => {
  const editor = fakeEditor(['a', 'b']);
  const note = createNoteMarkdown(editor);
  assert.equal(note.serialize(), 'a\n\nb');
});
