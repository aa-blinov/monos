import Paragraph from '@tiptap/extension-paragraph';

// An empty paragraph is a line the person made with Enter. Markdown has no place for it: the serializer wrote
// nothing, so the line was gone after the save, and the editor reloaded the note with the caret at the end.
// Obsidian and other markdown editors keep such a line as `&nbsp;`: it renders as a blank line everywhere, and
// it reads back here as an empty paragraph.
export const BLANK_LINE = '&nbsp;';
const NO_BREAK_SPACE = ' ';

/** A paragraph whose only text is non-breaking spaces (what `&nbsp;` decodes to) is an empty line. */
export function isBlankLineNode(node) {
  const content = node?.content;
  if (!Array.isArray(content) || content.length !== 1) return false;
  const [child] = content;
  const text = child.type === 'text' ? String(child.text || '') : '';
  return text.length > 0 && [...text].every((character) => character === NO_BREAK_SPACE);
}

export const EditableParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node, parent) {
          // An empty note and an empty list item are not lines the person made: they stay empty in the file.
          // `&nbsp;` is for an empty line among other content.
          const alone = parent?.childCount === 1;
          if (node.content.size === 0 && !alone) state.write(BLANK_LINE);
          else state.renderInline(node);
          state.closeBlock(node);
        },
      },
    };
  },
});
