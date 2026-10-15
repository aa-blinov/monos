import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { common, createLowlight } from 'lowlight';
import { NOTES_DIR } from '../config.js';
import { httpError, readTextFile, resolveNotesChildPath, resolveNotesPath } from '../utils.js';
import { isLockedNote, readWithSession, sessionFor } from '../note-lock.js';

const TEXT_EXTENSIONS = new Set(['.md', '.markdown']);
const SKIPPED_SEGMENTS = new Set(['.git', '.monos', '__MACOSX']);

// Print runs its own renderer, so the editor's highlighting never reached it:
// every code block came out monochrome while the same note was coloured on
// screen. Same languages as the editor, so a printed note looks like the note.
const printLowlight = createLowlight(common);
printLowlight.registerAlias({ ini: 'env' });

/**
 * Walk a hast tree into spans.
 *
 * Two shapes matter here and getting either wrong fails quietly: a text node
 * carries `value`, while an element carries its classes in `properties.className`
 * and its text in nested `children`. Reading one shape only printed the block
 * either uncoloured or with its keywords missing.
 */
function highlightTree(nodes) {
  let out = '';
  for (const node of nodes || []) {
    if (typeof node.value === 'string') {
      out += escapeHtml(node.value);
      continue;
    }
    const classNames = node.properties?.className || [];
    const inner = highlightTree(node.children || []);
    out += classNames.length
      ? `<span class="${escapeHtml(classNames.join(' '))}">${inner}</span>`
      : inner;
  }
  return out;
}

/**
 * Colourise `<pre><code class="language-x">` in already-rendered HTML.
 *
 * An unknown language falls back to auto-detection rather than failing: the
 * editor does the same, and a mis-guessed block still reads better than none.
 */
function highlightCodeBlocks(html) {
  return String(html).replace(
    /<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g,
    (full, language, body) => {
      const code = body.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
      let nodes;
      try {
        nodes = printLowlight.highlight(language, code).children;
      } catch {
        try {
          nodes = printLowlight.highlightAuto(code).children;
        } catch {
          return full;
        }
      }
      return `<pre><code class="language-${escapeHtml(language)}">${highlightTree(nodes)}</code></pre>`;
    },
  );
}

// The printed document is not the app, so it deliberately does not inherit the
// interface's mono-everywhere rule: a note is prose first. Warm paper, ink,
// and the theme's own accent for links keep it recognisable as Monos without
// turning a reading page into a terminal.
const STYLESHEET = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #fbf1c7;
    color: #3c3836;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11pt;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { max-width: 46em; margin: 0 auto; padding: 18mm 16mm; }
  .meta {
    color: #7c6f64;
    font-size: 8.5pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-bottom: 1px solid #d5c4a1;
    padding-bottom: 6pt;
    margin-bottom: 18pt;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; letter-spacing: -0.02em; page-break-after: avoid; }
  h1 { font-size: 20pt; }
  h2 { font-size: 15pt; margin-top: 20pt; }
  h3 { font-size: 12.5pt; margin-top: 16pt; }
  p { orphans: 3; widows: 3; }
  a { color: #458588; }
  /* Радиусы печатной таблицы тоже держатся шкалы: sm = 2px у инлайн-кода,
     md = 6px у блока. Здесь стояло 3px — шаг мимо шкалы и мимо редактора. */
  code { background: #ebdbb2; padding: 0.1em 0.3em; border-radius: 2px; font-size: 0.92em; }
  pre { background: #ebdbb2; padding: 10pt; border-radius: 6px; overflow: visible; white-space: pre-wrap; word-break: break-word; page-break-inside: avoid; }
  pre code { background: transparent; padding: 0; }
  /* Syntax colours are the same derived ramp the editor uses for gruvbox
     light: the eight --code-* roles are walked from the accent hues until they
     clear AA 4.5:1 on the block background. That background is #ebdbb2 in both
     places, so the values transfer as-is — re-derived here they would be a
     second palette to keep in sync. print.test.js asserts the contrast. */
  .hljs-comment, .hljs-quote { color: #685d52; font-style: italic; }
  .hljs-keyword, .hljs-literal, .hljs-doctag, .hljs-formula { color: #8a4c69; }
  .hljs-string, .hljs-regexp, .hljs-addition { color: #636211; }
  .hljs-number, .hljs-symbol, .hljs-bullet, .hljs-link, .hljs-variable,
  .hljs-template-variable, .hljs-params, .hljs-property { color: #9e450a; }
  .hljs-title, .hljs-title.function_, .hljs-section, .hljs-name { color: #356669; }
  .hljs-type, .hljs-title.class_, .hljs-built_in { color: #7d5913; }
  .hljs-tag, .hljs-attr, .hljs-selector-tag, .hljs-selector-attr,
  .hljs-selector-class, .hljs-selector-id, .hljs-meta { color: #456846; }
  .hljs-punctuation, .hljs-operator, .hljs-subst { color: #695d54; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: 700; }
  blockquote { border-left: 2px solid #d5c4a1; margin-left: 0; padding-left: 12pt; color: #7c6f64; }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; page-break-inside: avoid; }
  th, td { border: 1px solid #d5c4a1; padding: 5pt 7pt; text-align: left; }
  th { background: #ebdbb2; }
  hr { border: 0; border-top: 1px solid #d5c4a1; margin: 18pt 0; }
  .chapter { page-break-before: always; }
  .chapter:first-of-type { page-break-before: avoid; }
  .chapter-path {
    color: #98971a;
    font-size: 8.5pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 4pt;
  }
  ul, ol { padding-left: 1.4em; }
  li { margin-bottom: 2pt; }
`;

marked.setOptions({ mangle: false, headerIds: false, gfm: true, breaks: false });

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Resolve attachment src to a data URI so the printed sheet is self-contained. */
function inlineAttachments(html, absoluteDir) {
  return html.replace(/<img[^>]+src="([^"]+)"[^>]*>/g, (tag, src) => {
    if (/^(https?:|data:)/.test(src)) return tag;
    const filePath = path.resolve(absoluteDir, decodeURIComponent(src));
    if (!filePath.startsWith(absoluteDir) || !fs.existsSync(filePath)) return tag;
    const mime = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    }[path.extname(filePath).toLowerCase()];
    if (!mime) return tag;
    return tag.replace(/src="[^"]*"/, `src="data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}"`);
  });
}

function renderMarkdownToHtml(markdown, absoluteDir) {
  const html = marked.parse(String(markdown ?? ''), { async: false });
  return inlineAttachments(highlightCodeBlocks(html), absoluteDir);
}

function wrapDocument(title, metaLine, bodyHtml) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${STYLESHEET}</style></head>
<body><main class="sheet">
${metaLine ? `<div class="meta">${escapeHtml(metaLine)}</div>` : ''}
${bodyHtml}
</main></body></html>`;
}

function collectNotes(root) {
  const notesRoot = path.resolve(NOTES_DIR);
  const resolvedRoot = path.resolve(root);
  if (resolvedRoot !== notesRoot && !resolvedRoot.startsWith(notesRoot + path.sep)) {
    throw httpError(403, 'Path must stay inside notes');
  }
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIPPED_SEGMENTS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(full);
    }
  };
  walk(root);
  found.sort((a, b) => a.localeCompare(b));
  return found;
}

/** One note as a complete, print-ready document. */
export function buildNoteDocument(requestPath) {
  const filePath = resolveNotesPath(requestPath || '');
  if (!TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw httpError(400, 'Only Markdown notes can be printed');
  }
  const title = path.basename(filePath, path.extname(filePath));
  const stored = readTextFile(filePath);
  const session = sessionFor(requestPath);
  const text = isLockedNote(stored) ? (session ? readWithSession(stored, session) : null) : stored;
  // A locked note prints only while it is unlocked in this session; a sealed note is never printed.
  if (text === null) throw httpError(423, 'Unlock the note to print it');
  const body = renderMarkdownToHtml(text, path.dirname(filePath));
  return { html: wrapDocument(title, '', body), title, fileName: `${title}.pdf` };
}

/** Every note under a folder as one book. */
export function buildTreeDocument(requestPath = '') {
  // Resolved against the notes root; the root itself is a legal target and
  // means "print everything".
  const root = resolveNotesChildPath(requestPath, { allowRoot: true });
  const files = collectNotes(root);
  if (files.length === 0) throw httpError(404, 'No notes found in this folder');

  const chapters = files.map((filePath) => {
    const rel = path.relative(path.resolve(NOTES_DIR), filePath);
    const html = renderMarkdownToHtml(readTextFile(filePath), path.dirname(filePath));
    return `<section class="chapter">
  <div class="chapter-path">${escapeHtml(rel.replace(/\.[^.]+$/, ''))}</div>
  ${html}
</section>`;
  }).join('\n');

  const label = requestPath ? requestPath : 'All notes';
  return {
    html: wrapDocument(label, `${files.length} notes`, chapters),
    title: label,
    fileName: `monos-${(requestPath ? `${requestPath}-` : '') + new Date().toISOString().slice(0, 10)}.pdf`,
  };
}

/**
 * PDF output is produced by Electron's printToPDF, which only exists when the
 * backend is hosted by the main process. Under plain `node index.js` there is
 * no renderer available, so the endpoint reports that instead of failing
 * obscurely — the HTML endpoints above keep working everywhere.
 */
async function renderPdfWithElectron(html, fileName) {
  const electron = await import('electron').catch(() => null);
  if (!electron?.BrowserWindow || !process.versions?.electron) return null;

  const { BrowserWindow, dialog } = electron;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save PDF',
    defaultPath: fileName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const printer = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await printer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const data = await printer.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    fs.writeFileSync(filePath, data);
    return { canceled: false, filePath };
  } finally {
    printer.destroy();
  }
}

/**
 *   GET  /api/print/note?path=<note>     one note as HTML
 *   GET  /api/print/tree?path=<folder>    every note as one book, as HTML
 *   POST /api/print/pdf  { scope, path }  save a PDF (Electron only)
 */
export function registerPrintRoutes(app) {
  app.get('/api/print/note', (req, res) => {
    try {
      res.type('html').send(buildNoteDocument(req.query.path).html);
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || 'Print failed' });
    }
  });

  app.get('/api/print/tree', (req, res) => {
    try {
      const requestPath = typeof req.query.path === 'string' ? req.query.path : '';
      res.type('html').send(buildTreeDocument(requestPath).html);
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || 'Print failed' });
    }
  });

  app.post('/api/print/pdf', async (req, res) => {
    try {
      const scope = req.body?.scope === 'tree' ? 'tree' : 'note';
      const requestPath = typeof req.body?.path === 'string' ? req.body.path : '';
      const document = scope === 'tree' ? buildTreeDocument(requestPath) : buildNoteDocument(requestPath);
      const result = await renderPdfWithElectron(document.html, document.fileName);
      if (!result) {
        throw httpError(501, 'PDF export needs the desktop app — open Notes, then use Print.');
      }
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || 'Print failed' });
    }
  });
}