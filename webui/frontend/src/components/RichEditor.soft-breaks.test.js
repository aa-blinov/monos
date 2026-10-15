import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
import { markdownToEditorContent } from '../lib/markdown-editor-content.js';

/**
 * A single newline inside a paragraph is a soft break. It used to be joined into a space on load, so every
 * save of such a note changed the file. These tests keep the newline through a load and a save.
 */
function makeEditor(markdown) {
  return new Editor({
    element: null,
    extensions: createRichEditorExtensions('...'),
    content: markdownToEditorContent(markdown),
  });
}

describe('одиночный перенос строки в абзаце', () => {
  it('сохраняется при сохранении заметки, а не превращается в пробел', () => {
    const editor = makeEditor('первая строка\nвторая строка\n');
    expect(editor.storage.markdown.getMarkdown()).toBe('первая строка\nвторая строка');
  });

  it('в тексте редактора виден пробелом, как в предпросмотре', () => {
    const editor = makeEditor('первая строка\nвторая строка\n');
    expect(editor.getText()).toContain('первая строка вторая строка');
  });

  it('жёсткий перенос (Shift+Enter) по-прежнему пишется обратным слешем', () => {
    const editor = makeEditor('первая\\\nвторая\n');
    expect(editor.storage.markdown.getMarkdown()).toContain('первая\\\nвторая');
  });

  it('внутри цитаты перенос остаётся внутри цитаты', () => {
    const editor = makeEditor('> первая\n> вторая\n');
    expect(editor.storage.markdown.getMarkdown()).toBe('> первая\n> вторая');
  });
});
