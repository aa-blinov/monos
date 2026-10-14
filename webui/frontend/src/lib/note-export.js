/**
 * Export of one note into the formats people open elsewhere.
 *
 * Markdown and plain text come from the editor's text, so they match the note once
 * it is saved. HTML is the print view's document: the backend inlines the note's
 * images, so the saved file opens without the app. PDF is not here: it goes through
 * print.js, because only the desktop shell can render it.
 */
import { marked } from 'marked';

// Символы, запрещённые в именах файлов хотя бы одной из систем.
const UNSAFE_FILE_CHARS = /[\\/?%*:|"<>\u0000-\u001f]/g;

/** A file name taken from the note title, accepted by every system. */
export function exportFileName(title, extension) {
  const base = String(title || '')
    .replace(UNSAFE_FILE_CHARS, '_')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  return `${base || 'note'}.${extension}`;
}

// Inline tokens: the words, with links and emphasis reduced to their text.
function inlineText(tokens = []) {
  return tokens
    .map((token) => {
      if (token.type === 'br') return '\n';
      if (token.tokens) return inlineText(token.tokens);
      return token.text ?? '';
    })
    .join('');
}

function blockText(token, depth) {
  switch (token.type) {
    case 'heading':
    case 'paragraph':
      return inlineText(token.tokens);
    case 'text':
      return token.tokens ? inlineText(token.tokens) : (token.text ?? '');
    case 'code':
      return token.text;
    case 'blockquote':
      return blocksText(token.tokens, depth);
    case 'list':
      return token.items
        .map((item, index) => {
          const marker = token.ordered ? `${(token.start ?? 1) + index}. ` : '- ';
          const task = item.task ? (item.checked ? '[x] ' : '[ ] ') : '';
          return `${'  '.repeat(depth)}${marker}${task}${blocksText(item.tokens, depth + 1)}`;
        })
        .join('\n');
    case 'table':
      return [token.header, ...token.rows]
        .map((row) => row.map((cell) => inlineText(cell.tokens)).join('\t'))
        .join('\n');
    case 'hr':
    case 'space':
      return '';
    default:
      return token.text ?? '';
  }
}

function blocksText(tokens = [], depth = 0) {
  return tokens
    .map((token) => blockText(token, depth))
    .filter((part) => part !== '')
    .join('\n\n');
}

/**
 * The Markdown as plain text: the words without the markup. Headings, lists, task
 * marks, code and table rows stay readable.
 */
export function markdownToPlainText(markdown) {
  const text = blocksText(marked.lexer(String(markdown || '')));
  return `${text.replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/** The note as the print view renders it: one standalone HTML document. */
export async function fetchNoteHtml(notePath) {
  const response = await fetch(`/api/print/note?path=${encodeURIComponent(notePath)}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${response.status}`);
  }
  return response.text();
}

/** Start a browser download of text content, the same way the backup export does. */
export function downloadFile(fileName, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
