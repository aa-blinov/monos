import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
import { markdownToEditorContent } from '../lib/markdown-editor-content.js';

/**
 * A picture must survive an edit-and-save.
 *
 * Found by saving a note in the browser: the image rendered fine, one keystroke
 * was added, and the saved file came back without it. Nothing failed — the
 * picture was simply not written. Both plain `![](…)` and the normalised
 * `![[…]]` form are covered, because the second is built on the first.
 */
function makeEditor(markdown) {
  return new Editor({
    element: null,
    extensions: createRichEditorExtensions('...'),
    content: markdownToEditorContent(markdown),
  });
}

describe('редактор не теряет картинки при сериализации', () => {
  it('markdown-картинка остаётся в выходе', () => {
    const editor = makeEditor('# Заметка\n\n![image-2](_attachments/image-2.png)\n');
    expect(editor.storage.markdown.getMarkdown()).toContain('![image-2](_attachments/image-2.png)');
  });

  it('картинка из вставки ![[…]] остаётся в выходе', () => {
    const editor = makeEditor('# Заметка\n\n![[image-2.png]]\n');
    expect(editor.storage.markdown.getMarkdown()).toContain('_attachments/image-2.png');
  });

  it('картинка переживает правку в соседнем абзаце', () => {
    const editor = makeEditor('# Заметка\n\n![image-2](_attachments/image-2.png)\n');
    editor.commands.setContent(markdownToEditorContent('# Заметка\n\n![image-2](_attachments/image-2.png)\n\nX\n'));
    expect(editor.storage.markdown.getMarkdown()).toContain('_attachments/image-2.png');
  });

  it('несколько картинок в одном абзаце не схлопываются', () => {
    const editor = makeEditor('![[a.png]]![[b.png]]\n');
    const out = editor.storage.markdown.getMarkdown();
    expect(out).toContain('a.png');
    expect(out).toContain('b.png');
  });
});
