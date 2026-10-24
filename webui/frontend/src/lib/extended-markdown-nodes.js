/**
 * Editor side of the extended Markdown (see markdown-extended.js): the highlight, subscript and superscript marks
 * and the footnote reference and definition nodes. Each carries the `markdown.serialize` spec that writes it back as
 * the text it was read from: `==x==`, `~x~`, `^x^`, `[^1]` and `[^1]: text`.
 */

import { InputRule, Mark, Node, markInputRule, mergeAttributes } from '@tiptap/core';
import { markPlugin, subPlugin, supPlugin } from './markdown-extended.js';

function pairedMark({ name, tag, marker, find, plugin, parseRule = { tag } }) {
  const command = name.charAt(0).toUpperCase() + name.slice(1);
  return Mark.create({
    name,
    parseHTML: () => [parseRule],
    renderHTML: ({ HTMLAttributes }) => [tag, mergeAttributes(HTMLAttributes), 0],
    addCommands() {
      return {
        [`toggle${command}`]: () => ({ commands }) => commands.toggleMark(name),
      };
    },
    // Typing the closing marker turns the text between the two into the mark, as `**` does for bold.
    addInputRules() {
      return [markInputRule({ find, type: this.type })];
    },
    addStorage() {
      return {
        markdown: {
          // Whitespace at the edge goes outside: `== x ==` is not a highlight.
          serialize: { open: marker, close: marker, mixable: true, expelEnclosingWhitespace: true },
          // Text pasted from elsewhere is read by the same rule.
          parse: { setup: (md) => md.use(plugin) },
        },
      };
    },
  });
}

export const Highlight = pairedMark({
  name: 'highlight',
  tag: 'mark',
  marker: '==',
  find: /(?:^|\s)(==(?!\s)([^=]*[^=\s])==)$/,
  plugin: markPlugin,
});

// `~~` is a strikethrough, and a lone `~` is a subscript: the lookbehind keeps the second `~` of `~~gone~` from opening one.
export const Subscript = pairedMark({
  name: 'subscript',
  tag: 'sub',
  marker: '~',
  find: /(?<!~)~([^~\s]+)~$/,
  plugin: subPlugin,
});

export const Superscript = pairedMark({
  name: 'superscript',
  tag: 'sup',
  marker: '^',
  find: /\^([^^\s]+)\^$/,
  plugin: supPlugin,
  // A footnote reference is a `sup` too, and has its own node.
  parseRule: { tag: 'sup', getAttrs: (element) => (element.hasAttribute('data-footnote-ref') ? false : null) },
});

export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { label: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote-ref]', priority: 60 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, {
      class: 'footnote-ref',
      'data-footnote-ref': node.attrs.label,
      contenteditable: 'false',
    }), node.attrs.label];
  },

  // `[^1]` typed in the text becomes the marker; without a definition it is read back as the text again.
  addInputRules() {
    const type = this.type;
    return [new InputRule({
      find: /\[\^([^\]\s[]{1,64})\]$/,
      handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, type.create({ label: match[1] }));
      },
    })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.text(`[^${node.attrs.label}]`, false);
        },
      },
    };
  },
});

export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return { label: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'p[data-footnote-def]', priority: 60 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, {
      class: 'footnote-def',
      'data-footnote-def': node.attrs.label,
    }), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`[^${node.attrs.label}]: `);
          state.renderInline(node, false);
          state.closeBlock(node);
        },
      },
    };
  },
});

export const ExtendedMarkdown = [Highlight, Subscript, Superscript, FootnoteRef, FootnoteDefinition];
