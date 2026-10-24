import { mergeAttributes, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Callouts, ExternalLinks, InlineMath, MathBlock, MermaidBlock, NoteEmbed, PdfEmbed, WikiLinks } from './richEditorExtras.js';
import { SoftBreak } from './soft-break.js';
import { EditableParagraph } from './blank-line.js';
import { Markdown } from 'tiptap-markdown';
import { search } from 'prosemirror-search';
import { MarkdownFidelity, serializeImage } from './markdown-fidelity.js';

// 150 блоков в хранилище уже размечены языком (105 bash, 19 python, 8 shell…),
// а редактор их игнорировал. `common` покрывает 11 языков из 12 встречающихся;
// `docker` и `cron` не входят в набор — для них расширение само откатывается на
// highlightAuto, а не падает.
const lowlight = createLowlight(common);
// Ключ — язык, значение — синонимы (не наоборот). Без `env` блок .env ушёл бы
// в автоопределение вместо ini.
lowlight.registerAlias({ ini: 'env' });

function imageCaption(attributes, attachmentPath) {
  const alt = String(attributes.alt || '').trim();
  if (alt) return alt.replace(/\.[^.]+$/, '');

  const rawPath = attachmentPath || attributes.src || '';
  const fileName = decodeURIComponent(String(rawPath).split('/').pop() || '').trim();
  return fileName.replace(/\.[^.]+$/, '') || 'image';
}

const AttachmentImage = Image.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      resolveImageSrc: (src) => src,
      resolveImagePath: () => '',
    };
  },

  renderHTML({ HTMLAttributes }) {
    const src = this.options.resolveImageSrc(HTMLAttributes.src);
    const attachmentPath = this.options.resolveImagePath(HTMLAttributes.src);
    const attrs = attachmentPath
      ? { src, 'data-attachment-path': attachmentPath }
      : { src };
    const imageAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, attrs);
    const caption = imageCaption(HTMLAttributes, attachmentPath);
    // A dated name the app made up (image-20261016-105833) says nothing; the picture goes without a caption.
    const showsCaption = !/^image-\d{8}-\d{6}(?:[-\s]\d+)?$/.test(caption);
    return [
      'span',
      { class: 'editor-image-frame', contenteditable: 'false' },
      ['img', imageAttrs],
      ...(showsCaption ? [['span', { class: 'editor-image-caption' }, caption]] : []),
    ];
  },

  // `wiki`: the picture was written as `![[name.png]]` and is written back that way.
  addAttributes() {
    return { ...this.parent?.(), wiki: { default: false, rendered: false } };
  },

  addStorage() {
    return {
      markdown: {
        serialize: serializeImage,
        parse: {},
      },
    };
  },
});

// Поиск по тексту заметки. Плагин prosemirror-search считает совпадения и подсвечивает их;
// клавиша ⌘F остаётся без ускорителя в меню — в терминале она ищет по выводу.
const FindInNote = Extension.create({
  name: 'findInNote',
  addProseMirrorPlugins() {
    return [search()];
  },
});

// The note's title is the page's one level-1 heading. A `# Heading` in the text is a heading of the note, so a screen
// reader announces it one level down; the file keeps its `#`.
const BodyHeadingLevel = Extension.create({
  name: 'bodyHeadingLevel',
  addGlobalAttributes() {
    return [{
      types: ['heading'],
      attributes: {
        ariaLevel: {
          default: null,
          parseHTML: () => null,
          renderHTML: (attributes) => (attributes.level === 1 ? { 'aria-level': '2' } : {}),
        },
      },
    }];
  },
});

export function createRichEditorExtensions(placeholder, {
  resolveImageSrc = (src) => src,
  resolveImagePath = () => '',
  onWikiLinkActivate = null,
} = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false },
      // Штатный CodeBlock не умеет подсветку — его заменяет CodeBlockLowlight.
      codeBlock: false,
      // Абзац заменён на EditableParagraph: тот же узел, но пустая строка пишется в markdown как &nbsp;.
      paragraph: false,
    }),
    EditableParagraph,
    CodeBlockLowlight.configure({ lowlight }),
    Placeholder.configure({ placeholder }),
    AttachmentImage.configure({
      inline: true,
      resolveImageSrc,
      resolveImagePath,
      HTMLAttributes: {
        class: 'editor-image',
      },
    }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    InlineMath,
    MathBlock,
    MermaidBlock,
    NoteEmbed,
    PdfEmbed.configure({ resolveSrc: resolveImageSrc }),
    Callouts,
    WikiLinks.configure({ onActivate: onWikiLinkActivate }),
    ExternalLinks,
    SoftBreak,
    FindInNote,
    BodyHeadingLevel,
    MarkdownFidelity,
    Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: true, breaks: false, transformPastedText: true }),
  ];
}
