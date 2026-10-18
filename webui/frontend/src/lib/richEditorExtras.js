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

import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import katex from 'katex';
import { get } from 'svelte/store';
import { localizedText } from './strings.js';
import { calloutMarker, calloutTone } from './callouts.js';
import { collectBareUrls, collectWikiLinks, isOpenableUrl, wikiLinkAt, wikiLinkKey, wikiLinkStatus } from './wiki-link-decorations.js';

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

// Obsidian callouts: a quote whose first line is `[!type] Title` is drawn as a callout. The document keeps
// the quote as it was, so this is a decoration (a class and a data attribute), not a new node.
export const Callouts = Extension.create({
  name: 'callouts',

  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('callouts'),
      props: {
        decorations(state) {
          const decorations = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'blockquote') return true;
            const first = node.firstChild;
            const marker = first?.type.name === 'paragraph' ? calloutMarker(first.textContent) : null;
            if (marker) {
              decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                class: `callout callout-${calloutTone(marker.type)}`,
                'data-callout': marker.type,
              }));
              // As Obsidian shows it: the `[!type]` marker is hidden unless the caret is on that line, and the
              // title is a line of its own, in bold. Only the look changes; the text and the file stay as written.
              const lineStart = pos + 2;
              let lineEnd = lineStart + first.content.size;
              first.forEach((child, offset) => {
                if (child.type.name === 'softBreak' && lineEnd === lineStart + first.content.size) lineEnd = lineStart + offset;
              });
              const head = state.selection.$head.pos;
              const editingTitle = head >= lineStart && head <= lineEnd;
              const markerMatch = /^\s*\[![^\]]+\][+-]?\s*/.exec(first.textBetween(0, lineEnd - lineStart, ''));
              const markerEnd = lineStart + (markerMatch ? markerMatch[0].length : 0);
              if (markerMatch && !editingTitle) {
                decorations.push(Decoration.inline(lineStart, markerEnd, { class: 'callout-marker' }));
              }
              if (lineEnd > markerEnd) decorations.push(Decoration.inline(markerEnd, lineEnd, { class: 'callout-title' }));
            }
            return true;
          });
          return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
        },
      },
    })];
  },
});

// A PDF from the note's attachments, shown as a frame of its pages with a link to open it whole. The
// node writes `![[name.pdf]]` back, so the note reads the same in git as the embed it came from.
export const PdfEmbed = Node.create({
  name: 'pdfEmbed',
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    // The app turns the note-relative path into an address the window can load (RichEditor's resolveImageSrc).
    return { resolveSrc: (src) => src };
  },

  addAttributes() {
    return {
      name: { default: '' },
      src: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="pdf-embed"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'pdf-embed',
      'data-name': node.attrs.name,
      'data-src': node.attrs.src,
    })];
  },

  addNodeView() {
    const options = this.options;
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.dataset.type = 'pdf-embed';
      dom.className = 'pdf-embed';

      const head = document.createElement('div');
      head.className = 'pdf-embed-head';
      const title = document.createElement('span');
      const open = document.createElement('a');
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = get(localizedText).richEditor.pdfOpen;
      head.append(title, open);

      const frame = document.createElement('iframe');
      frame.className = 'pdf-embed-frame';

      dom.append(head, frame);

      const paint = (attrs) => {
        const url = options.resolveSrc(attrs.src);
        title.textContent = attrs.name;
        frame.title = attrs.name;
        frame.src = url;
        open.href = url;
      };
      paint(node.attrs);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'pdfEmbed') return false;
          paint(updated.attrs);
          return true;
        },
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

export const wikiLinksKey = new PluginKey('wikiLinks');
const RESOLVE_DELAY = 250;

/**
 * Wiki links drawn as links. The text stays `[[Target]]` in the document and in the file; this is a
 * decoration over it, so editing the link is ordinary typing. Each target is looked up once per note:
 * a link to a note that does not exist is drawn apart, and one that names several notes says so.
 *
 * `onActivate({ target, status })` runs on ⌘/Ctrl+click and on ⌘/Ctrl+Enter inside a link.
 */
export const WikiLinks = Extension.create({
  name: 'wikiLinks',

  addOptions() {
    return {
      resolve: async (target) => {
        const { resolveWikiLink } = await import('./editor-api.js');
        return resolveWikiLink(target);
      },
      onActivate: null,
    };
  },

  addStorage() {
    return { statuses: new Map() };
  },

  addCommands() {
    return {
      // Forget what the links led to: another note opened, or a note was created for a link.
      refreshWikiLinks: () => ({ tr, dispatch }) => {
        this.storage.statuses.clear();
        if (dispatch) tr.setMeta(wikiLinksKey, 'refresh');
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const { statuses } = this.storage;
    const options = this.options;
    const statusOf = (target) => statuses.get(wikiLinkKey(target)) || { kind: 'pending' };
    const activate = (view, pos) => {
      const link = wikiLinkAt(wikiLinksKey.getState(view.state).links, pos);
      if (!link || typeof options.onActivate !== 'function') return false;
      options.onActivate({ target: link.target, status: statusOf(link.target) });
      return true;
    };

    return [new Plugin({
      key: wikiLinksKey,
      state: {
        init: (_, state) => ({ links: collectWikiLinks(state.doc) }),
        apply(tr, value, _old, newState) {
          if (tr.docChanged) return { links: collectWikiLinks(newState.doc) };
          // A new object makes the decorations draw again with the answers that arrived.
          return tr.getMeta(wikiLinksKey) ? { links: value.links } : value;
        },
      },
      props: {
        decorations(state) {
          const { links } = wikiLinksKey.getState(state);
          if (!links.length) return null;
          const { from: selFrom, to: selTo } = state.selection;
          const decorations = [];
          for (const link of links) {
            decorations.push(Decoration.inline(link.from, link.to, {
              class: `wiki-link wiki-link-${statusOf(link.target).kind}`,
              'data-wiki-target': link.target,
            }));
            // The brackets are Markdown, not content: they hide while the caret is elsewhere and come back as
            // soon as it touches the link, so the text can still be edited. The note's file is not changed.
            const touched = selTo >= link.from && selFrom <= link.to;
            if (touched || link.to - link.from < 5) continue;
            decorations.push(Decoration.inline(link.from, link.from + 2, { class: 'wiki-link-bracket' }));
            decorations.push(Decoration.inline(link.to - 2, link.to, { class: 'wiki-link-bracket' }));
            // `[[target|shown]]` reads as "shown": the target and the bar hide too, when the text is exactly that.
            if (link.alias) {
              const head = `[[${link.target}|`;
              const end = link.from + head.length;
              if (end < link.to - 2 && state.doc.textBetween(link.from, end, '', '\u0001') === head) {
                decorations.push(Decoration.inline(link.from + 2, end, { class: 'wiki-link-bracket' }));
              }
            }
          }
          return DecorationSet.create(state.doc, decorations);
        },
        handleClick(view, pos, event) {
          if (!(event.metaKey || event.ctrlKey)) return false;
          return activate(view, pos);
        },
        handleKeyDown(view, event) {
          if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || !view.state.selection.empty) return false;
          return activate(view, view.state.selection.from);
        },
      },
      view(view) {
        let timer = null;
        const lookUp = () => {
          timer = null;
          const wanted = new Map();
          for (const link of wikiLinksKey.getState(view.state).links) {
            const key = wikiLinkKey(link.target);
            if (!statuses.has(key) && !wanted.has(key)) wanted.set(key, link.target);
          }
          if (!wanted.size) return;
          for (const key of wanted.keys()) statuses.set(key, { kind: 'pending' });
          Promise.all([...wanted].map(async ([key, target]) => {
            try {
              statuses.set(key, wikiLinkStatus(await options.resolve(target)));
            } catch {
              // Offline or the server is busy: the link stays plain and is looked up with the next note.
              statuses.set(key, { kind: 'unknown' });
            }
          })).then(() => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(wikiLinksKey, 'resolved'));
          });
        };
        const schedule = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(lookUp, RESOLVE_DELAY);
        };
        schedule();
        return {
          update: (_view, previous) => {
            if (wikiLinksKey.getState(view.state) !== wikiLinksKey.getState(previous)) schedule();
          },
          destroy: () => { if (timer) clearTimeout(timer); },
        };
      },
    })];
  },
});

export const externalLinksKey = new PluginKey('externalLinks');

/** The web address at a position: a Markdown link around it, or a plain address typed in the text. */
export function externalLinkAt(state, pos) {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  const linkMark = [...$pos.marks(), ...($pos.nodeAfter?.marks || [])].find((mark) => mark.type.name === 'link');
  if (linkMark?.attrs?.href) return { href: linkMark.attrs.href };
  const bare = externalLinksKey.getState(state)?.urls.find((url) => pos >= url.from && pos <= url.to);
  return bare ? { href: bare.href, from: bare.from, to: bare.to } : null;
}

/**
 * Web addresses open from the editor. A plain `https://…` in the text is drawn as a link (a decoration:
 * the file keeps the address as typed), and it and any Markdown link open in the browser on
 * Ctrl/⌘+click or Ctrl/⌘+Enter. A plain click only places the caret, so the text stays editable.
 */
export const ExternalLinks = Extension.create({
  name: 'externalLinks',

  addOptions() {
    return {
      onOpen: (href) => { window.open(href, '_blank', 'noopener,noreferrer'); },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const open = (state, pos) => {
      const link = externalLinkAt(state, pos);
      if (!link || !isOpenableUrl(link.href)) return false;
      options.onOpen(link.href);
      return true;
    };
    return [new Plugin({
      key: externalLinksKey,
      state: {
        init: (_, state) => ({ urls: collectBareUrls(state.doc) }),
        apply: (tr, value, _old, newState) => (tr.docChanged ? { urls: collectBareUrls(newState.doc) } : value),
      },
      props: {
        decorations(state) {
          const { urls } = externalLinksKey.getState(state);
          if (!urls.length) return null;
          return DecorationSet.create(state.doc, urls.map((url) => Decoration.inline(url.from, url.to, { class: 'external-link' })));
        },
        handleClick(view, pos, event) {
          if (!(event.metaKey || event.ctrlKey)) return false;
          return open(view.state, pos);
        },
        handleKeyDown(view, event) {
          if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || !view.state.selection.empty) return false;
          return open(view.state, view.state.selection.from);
        },
      },
    })];
  },
});
