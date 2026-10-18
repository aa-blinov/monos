import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
import { markdownToEditorContent } from '../lib/markdown-editor-content.js';

/**
 * An empty line made with Enter must survive a save and a reload. It used to vanish on save, and the editor
 * reloaded the note with the caret at the end. These tests keep the empty line through a load and a save.
 */
function makeEditor(markdown) {
  return new Editor({
    element: null,
    extensions: createRichEditorExtensions('...'),
    content: markdownToEditorContent(markdown),
  });
}

describe('пустая строка в заметке', () => {
  it('пустая строка в начале заметки сохраняется при сохранении', () => {
    const editor = makeEditor('&nbsp;\n\nПервая строка\n\nВторая строка\n');
    expect(editor.storage.markdown.getMarkdown()).toBe('&nbsp;\n\nПервая строка\n\nВторая строка');
  });

  it('пустая строка между абзацами сохраняется', () => {
    const editor = makeEditor('Первая строка\n\n&nbsp;\n\nВторая строка\n');
    expect(editor.storage.markdown.getMarkdown()).toBe('Первая строка\n\n&nbsp;\n\nВторая строка');
  });

  it('две пустые строки подряд не сливаются в одну', () => {
    const editor = makeEditor('Первая\n\n&nbsp;\n\n&nbsp;\n\nВторая\n');
    expect(editor.storage.markdown.getMarkdown()).toBe('Первая\n\n&nbsp;\n\n&nbsp;\n\nВторая');
  });

  it('пустая заметка и пустой пункт списка не получают &nbsp; при переходе в визуальный редактор', () => {
    expect(makeEditor('').storage.markdown.getMarkdown()).toBe('');
    expect(makeEditor('\n\n  \n').storage.markdown.getMarkdown()).toBe('');
    expect(makeEditor('- \n- b\n').storage.markdown.getMarkdown()).not.toContain('&nbsp;');
  });
});
