/**
 * Editor nodes for formulas and diagrams.
 *
 * Both are plain Markdown constructs that a CommonMark parser does not know
 * about, so the conversion in `markdown-extras.js` turns them into these nodes
 * on the way in, and the `markdown.serialize` specs below turn them back on the
 * way out. The round trip is what keeps a note readable in git: a formula stays
 * `$…$`, a diagram stays a ```mermaid fence.
 *
 * Rendering is done in NodeViews rather than in `renderHTML` for two reasons:
 * KaTeX needs a DOM to measure, and Mermaid is ~1 MB of JavaScript that must
 * stay out of the initial bundle — hence the dynamic import.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';

let mermaidPromise = null;

/**
 * Mermaid paints itself with its own palette, and `theme: 'neutral'` gives the
 * nodes a lavender fill that has no business in this app. Reading the live CSS
 * variables keeps the diagram in the Gruvbox the person actually chose, and it
 * follows a theme switch instead of keeping the colours it was drawn with.
 */
function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => (styles.getPropertyValue(name) || '').trim() || fallback;
  return {
    bg: read('--bg-primary', '#fbf1c7'),
    panel: read('--bg-secondary', '#ebdbb2'),
    text: read('--text-primary', '#282828'),
    muted: read('--text-secondary', '#928374'),
    border: read('--border-subtle', '#d5c4a1'),
    accent: read('--note-accent', read('--text-primary', '#282828')),
  };
}

function paletteSignature(palette) {
  return Object.values(palette).join('|');
}

let lastSignature = '';

async function getMermaid(palette) {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => mermaid);
  }
  const mermaid = await mermaidPromise;

  const signature = paletteSignature(palette);
  if (signature !== lastSignature) {
    lastSignature = signature;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'inherit',
      themeVariables: {
        background: palette.bg,
        primaryColor: palette.panel,
        primaryTextColor: palette.text,
        primaryBorderColor: palette.border,
        secondaryColor: palette.panel,
        tertiaryColor: palette.bg,
        lineColor: palette.muted,
        textColor: palette.text,
        mainBkg: palette.panel,
        nodeBorder: palette.border,
        clusterBkg: palette.bg,
        clusterBorder: palette.border,
        edgeLabelBackground: palette.bg,
      },
    });
  }
  return mermaid;
}

/** KaTeX with `throwOnError: false` so a typo shows as red text, not a crash. */
function renderKatex(latex, displayMode) {
  const holder = document.createElement(displayMode ? 'div' : 'span');
  try {
    katex.render(latex, holder, { displayMode, throwOnError: false, output: 'html' });
  } catch {
    holder.textContent = displayMode ? `$$${latex}$$` : `$${latex}$`;
    holder.classList.add('math-error');
  }
  return holder;
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { latex: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-type': 'inline-math',
      'data-latex': node.attrs.latex,
    })];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.dataset.type = 'inline-math';
      dom.dataset.latex = node.attrs.latex;
      dom.appendChild(renderKatex(node.attrs.latex, false));

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'inlineMath') return false;
          dom.dataset.latex = updated.attrs.latex;
          dom.replaceChildren(renderKatex(updated.attrs.latex, false));
          return true;
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.text(`$${node.attrs.latex}$`, false);
        },
      },
    };
  },
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { latex: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'math-block',
      'data-latex': node.attrs.latex,
    })];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.dataset.type = 'math-block';
      dom.className = 'math-block';
      dom.appendChild(renderKatex(node.attrs.latex, true));

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'mathBlock') return false;
          dom.dataset.latex = updated.attrs.latex;
          dom.replaceChildren(renderKatex(updated.attrs.latex, true));
          return true;
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write('$$');
          state.ensureNewLine();
          state.text(node.attrs.latex, false);
          state.ensureNewLine();
          state.write('$$');
          state.closeBlock(node);
        },
      },
    };
  },
});

export const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { code: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-block"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'mermaid-block',
      'data-code': node.attrs.code,
    })];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.dataset.type = 'mermaid-block';
      dom.className = 'mermaid-block';

      // Пока модуль грузится, показываем исходник: пустой блок выглядит как
      // сломанная заметка.
      const source = document.createElement('pre');
      source.className = 'mermaid-source';
      source.textContent = node.attrs.code;
      dom.appendChild(source);

      let token = 0;
      const draw = async (code) => {
        const myToken = ++token;
        try {
          const mermaid = await getMermaid(readPalette());
          // Mermaid находит свои элементы по id в документе; без id он отдаёт
          // устаревший SVG от предыдущей перерисовки.
          const { svg } = await mermaid.render(`monos-mermaid-${Date.now()}-${myToken}`, code);
          if (myToken !== token) return;
          const host = document.createElement('div');
          host.innerHTML = svg;
          dom.replaceChildren(host);
        } catch (error) {
          if (myToken !== token) return;
          dom.replaceChildren(source);
          source.classList.add('math-error');
          source.title = String(error?.message || error);
        }
      };

      void draw(node.attrs.code);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'mermaidBlock') return false;
          dom.dataset.code = updated.attrs.code;
          void draw(updated.attrs.code);
          return true;
        },
        destroy() {
          // Ничего чистить не нужно: узел удаляется вместе с DOM.
          token += 1;
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write('```mermaid');
          state.ensureNewLine();
          state.text(node.attrs.code, false);
          state.ensureNewLine();
          state.write('```');
          state.closeBlock(node);
        },
      },
    };
  },
});