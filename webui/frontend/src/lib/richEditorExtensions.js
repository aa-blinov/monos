import { mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { defaultMarkdownSerializer } from 'prosemirror-markdown';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';

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
    return [
      'span',
      { class: 'editor-image-frame', contenteditable: 'false' },
      ['img', imageAttrs],
      ['span', { class: 'editor-image-caption' }, imageCaption(HTMLAttributes, attachmentPath)],
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize: defaultMarkdownSerializer.nodes.image,
        parse: {},
      },
    };
  },
});

export function createRichEditorExtensions(placeholder, {
  resolveImageSrc = (src) => src,
  resolveImagePath = () => '',
} = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false },
    }),
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
    Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: true, breaks: false, transformPastedText: true }),
  ];
}
