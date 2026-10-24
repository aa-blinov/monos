import { Node } from '@tiptap/core';

// A single line break inside a paragraph. The editor shows it as a space, as the preview and the published
// site do (CommonMark renders it that way), and the file keeps the newline: saving writes it back where it was.
// Before this node existed, loading joined the two lines and every save of such a note changed the file.
export const SoftBreak = Node.create({
  name: 'softBreak',
  group: 'inline',
  inline: true,
  atom: true,

  parseHTML() {
    return [{ tag: 'span[data-soft-break]' }];
  },

  renderHTML() {
    return ['span', { 'data-soft-break': '' }, ' '];
  },

  renderText() {
    return ' ';
  },

  addStorage() {
    return {
      markdown: {
        parse: {
          // markdown-it turns a newline inside a paragraph into a plain space. This marker keeps it as a node.
          setup(markdownIt) {
            markdownIt.renderer.rules.softbreak = () => '<span data-soft-break></span>';
          },
        },
        // A heading is one line in the file: a line break inside one would end it.
        serialize(state, node, parent) {
          state.write(parent?.type?.name === 'heading' ? ' ' : '\n');
        },
      },
    };
  },
});
