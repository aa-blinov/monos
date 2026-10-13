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
/**
 * Встраивание другой заметки: `![[Заметка]]`.
 *
 * Obsidian и Logseq показывают на месте содержимое связанной заметки. Здесь то
 * же, но с двумя предосторожностями, без которых такое ломает редактор:
 *
 * - цикл (A встраивает B, B встраивает A) обрывается на имени, которое уже
 *   разворачивается выше по стеку, и показывается плашкой, а не пустым блоком;
 * - содержимое только читается: правка внутри вставки расходилась бы с
 *   оригиналом, а при сохранении ещё и размножилась бы по двум файлам.
 */

/** Имена заметок, которые сейчас разворачиваются: ловит циклы. */
const embedStack = [];
/** Кэш развёрнутого содержимого: заметка меняется редко, а вкладок может быть много. */
const embedCache = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
  }[char]));
}

function stripFrontmatterAndCode(text) {
  return String(text || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
}

/**
 * Инлайновое оформление поверх уже экранированного текста.
 *
 * Без него вставка показывала `**Название**` сырыми знаками — содержимое есть,
 * но читается как исходник, а не как заметка. Порядок важен: сначала код,
 * иначе `*` внутри `**` разъехался бы на два курсива.
 */
function inlineMarkdown(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

/** Отрисовка markdown встраиваемой заметки. Намеренно скромно: заголовки и
 *  абзацы, без картинок и без вложенных вставок — иначе кэш разрастается и
 *  один клик тянет за собой половину хранилища. */
function embedHtml(markdown) {
  const lines = stripFrontmatterAndCode(markdown).split('\n');
  const out = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^```/.test(line)) { out.push('<pre class="embed-code">' + escapeHtml(line) + '</pre>'); continue; }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6);
      out.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      out.push('<p class="embed-li">' + inlineMarkdown(escapeHtml(line.replace(/^\s*([-*+]|\d+\.)\s+/, '• '))) + '</p>');
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      out.push('<blockquote>' + inlineMarkdown(escapeHtml(line.replace(/^\s*>\s?/, ''))) + '</blockquote>');
      continue;
    }
    out.push('<p>' + inlineMarkdown(line) + '</p>');
  }
  return out.join('');
}

async function resolveEmbed(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return { ok: false, reason: 'empty' };
  if (embedCache.has(key)) return embedCache.get(key);
  // Ставим метку до запроса: два вложения одного цикла поймаются этой же строкой.
  if (embedStack.includes(key)) return { ok: false, reason: 'cycle' };

  const { get } = await import('./api/client.js');
  const { resolveWikiLink } = await import('./editor-api.js');
  const resolved = await resolveWikiLink(name);
  // Порядок важен: у неоднозначного ответа нет поля path, поэтому прежняя
  // проверка `!resolved || resolved.path` была ложной, ветка «неоднозначно»
  // недостижима, и вставка врала «заметка не найдена» при двух совпадениях.
  if (resolved?.ambiguous) {
    const value = { ok: false, reason: 'ambiguous', matches: resolved.matches || [] };
    embedCache.set(key, value);
    return value;
  }
  if (!resolved?.path) {
    const value = { ok: false, reason: 'missing' };
    embedCache.set(key, value);
    return value;
  }

  embedStack.push(key);
  try {
    const file = await get('/api/file', { path: resolved.path });
    const value = { ok: true, path: resolved.path, html: embedHtml(file?.content || '') };
    embedCache.set(key, value);
    return value;
  } finally {
    embedStack.pop();
  }
}

export const NoteEmbed = Node.create({
  name: 'noteEmbed',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return { name: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="note-embed"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'note-embed',
      'data-note-name': node.attrs.name,
    })];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.dataset.type = 'note-embed';
      dom.className = 'note-embed';

      const head = document.createElement('div');
      head.className = 'note-embed-head';
      head.textContent = node.attrs.name;

      const body = document.createElement('div');
      body.className = 'note-embed-body';
      body.textContent = '…';

      dom.append(head, body);

      let token = 0;
      const draw = async (name) => {
        const myToken = ++token;
        const result = await resolveEmbed(name);
        if (myToken !== token) return;
        body.classList.remove('embed-missing', 'embed-cycle', 'embed-ambiguous');
        if (!result.ok) {
          body.classList.add(`embed-${result.reason}`);
          const count = result.matches?.length || 0;
          // 1 заметка, 2–4 заметки, 5 и больше — заметок.
          const word = count % 10 === 1 && count % 100 !== 11
            ? 'заметка'
            : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)
              ? 'заметки'
              : 'заметок';
          body.textContent = {
            missing: 'Заметка не найдена',
            cycle: 'Циклическая ссылка — содержимое не разворачивается',
            ambiguous: `Под этим именем ${count} ${word} — вставка не знает какую`,
            empty: 'Пустая ссылка',
          }[result.reason] || 'Не удалось развернуть';
          return;
        }
        dom.dataset.notePath = result.path;
        body.innerHTML = result.html || '<p>Заметка пуста</p>';
      };

      void draw(node.attrs.name);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'noteEmbed') return false;
          dom.dataset.noteName = updated.attrs.name;
          head.textContent = updated.attrs.name;
          void draw(updated.attrs.name);
          return true;
        },
        destroy() { token += 1; },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`![[${node.attrs.name}]]`);
          state.closeBlock(node);
        },
      },
    };
  },
});
