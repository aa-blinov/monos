import { unescapeCalloutMarkers } from './callouts.js';
import { blockContext } from './blank-line.js';
import { markdownToEditorContent } from './markdown-editor-content.js';
import { buildSourceMap, writeWithSource } from './note-source.js';

// The serializer writes `\[\[` for the brackets of a wiki link; the file has them bare.
function normalizeWikiLinkMarkdown(markdown) {
  return String(markdown || '')
    .replace(/\\\[\\\[/g, '[[')
    .replace(/\\\]\\\]/g, ']]');
}

function topLevelNodes(editor) {
  const nodes = [];
  editor.state.doc.forEach((node) => nodes.push(node));
  return nodes;
}

// The empty paragraph the editor puts after a final list, quote, code block or rule so that there is somewhere to
// type is not a line the person wrote.
const isEditorTrailingParagraph = (node, previous) => node.type.name === 'paragraph'
  && node.content.size === 0 && Boolean(previous) && previous.type.name !== 'paragraph';

/**
 * The note's text as it goes into the file. `remember(markdown)` is called when a note is put into the editor;
 * `serialize()` then writes it back, block by block: what nobody touched comes out exactly as it was read, so a
 * letter typed and taken back, or an edit in one paragraph, changes nothing else in the file.
 *
 * @param {import('@tiptap/core').Editor} editor
 */
export function createNoteMarkdown(editor) {
  let sourceMap = null;

  // One block through the serializer, in the place it has in the note (a lone empty paragraph means something
  // else than one among others).
  function renderBlock(node, count) {
    blockContext.topLevelCount = count;
    try {
      const doc = editor.schema.topNodeType.create(null, [node]);
      const raw = editor.storage.markdown.serializer.serialize(doc);
      return unescapeCalloutMarkers(normalizeWikiLinkMarkdown(raw)).replace(/\n+$/, '');
    } finally {
      blockContext.topLevelCount = null;
    }
  }

  return {
    remember(markdown) {
      sourceMap = buildSourceMap(markdown, topLevelNodes(editor), {
        countNodes: (text) => markdownToEditorContent(text).content?.length ?? 0,
      });
    },
    serialize() {
      if (!editor?.storage.markdown) return '';
      const nodes = topLevelNodes(editor);
      return writeWithSource(sourceMap, nodes, (node) => renderBlock(node, nodes.length), { isTrailingGap: isEditorTrailingParagraph });
    },
  };
}
