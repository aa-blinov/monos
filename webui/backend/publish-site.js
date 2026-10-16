import fs from 'fs';
import path from 'path';
import { Marked } from 'marked';
import { getDb } from './database.js';
import { NOTES_DIR } from './config.js';
import { stripFrontmatter } from './routes/helpers.js';
import { httpError, linkNameCandidates, noteLinkNames, notesRelativePath, readTextFile, replaceOutsideCode, resolveNotesPath, wikiLinkTarget } from './utils.js';
import { isLockedNote } from './note-lock.js';

// A static copy of the notes in a folder on this computer. Nothing is uploaded: the output is plain
// HTML and files, and the folder it goes into is named by the person who asks for it. The site lives in
// its own `monos-site` folder, marked by a file the app writes, so a folder it did not make is never
// touched.

export const SITE_FOLDER = 'monos-site';
const MARKER = '.monos-site.json';
const IMAGE_EXTENSIONS = /^(png|jpe?g|gif|webp|svg)$/i;
const PDF_EXTENSION = /^pdf$/i;

const SITE_STYLE = `
body { margin: 0; font: 16px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; color: #1d1c1a; background: #faf8f3; }
main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
a { color: inherit; text-underline-offset: 3px; }
nav.crumbs, .meta { font-size: 0.8125rem; color: #6b6760; letter-spacing: 0.04em; margin-bottom: 1.5rem; }
h1 { font-size: 1.5rem; margin: 0 0 1rem; }
h2 { font-size: 1.05rem; margin: 2rem 0 0.5rem; }
img { max-width: 100%; height: auto; border-radius: 6px; }
pre, code { font-family: inherit; }
pre { background: #f1eee6; padding: 0.75rem; overflow-x: auto; border-radius: 6px; }
blockquote { margin: 1rem 0; padding: 0.5rem 0.9rem; border: 1px solid #d8d2c4; border-radius: 6px; background: #f3efe4; }
blockquote p:first-child { margin-top: 0; }
blockquote p:last-child { margin-bottom: 0; }
table { border-collapse: separate; border-spacing: 0; border: 1px solid #d8d2c4; border-radius: 6px; overflow: hidden; }
td, th { border-right: 1px solid #d8d2c4; border-bottom: 1px solid #d8d2c4; padding: 0.25rem 0.5rem; }
tr > :last-child { border-right: 0; }
table > :last-child > tr:last-child > * { border-bottom: 0; }
.pdf { margin: 1.25rem 0; border: 1px solid #d8d2c4; border-radius: 6px; overflow: hidden; }
.pdf-head { padding: 0.35rem 0.75rem; font-size: 0.8125rem; border-bottom: 1px solid #d8d2c4; }
.pdf iframe { display: block; width: 100%; height: 70vh; min-height: 320px; border: 0; }
ul.notes { list-style: none; padding: 0; margin: 0; }
ul.notes li { padding: 0.25rem 0; }
.unlinked { border-bottom: 1px dotted #6b6760; }
`;

const marker = (name) => `[!${name}]`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// The href from one folder of the site to a file of the site: both are posix paths inside the site.
function hrefBetween(fromDir, toPath) {
  const relative = path.posix.relative(fromDir || '.', toPath) || path.posix.basename(toPath);
  return relative.split('/').map((part) => encodeURIComponent(part)).join('/');
}

// The note's page sits in `pages/`, mirroring its place in the notes folder.
function pagePathOf(noteRelative) {
  return `pages/${noteRelative.replace(/\.md$/i, '')}.html`;
}

function markdownRenderer(context) {
  return new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      // Raw HTML written in a note is shown as text: a page must not run what a note carries.
      html({ text }) {
        return escapeHtml(text);
      },
      image({ href, title, text }) {
        const src = context.assetHref(href);
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`;
      },
    },
  });
}

/**
 * Obsidian embeds and wiki links become placeholders before Markdown runs. Their HTML is written here,
 * not by Markdown, so the escaping that protects the note's own text does not apply to it.
 */
function holdSyntax(body, context) {
  const held = [];
  const hold = (html, block) => {
    held.push({ html, block });
    return `MONOSHOLD${held.length - 1}X`;
  };

  let text = replaceOutsideCode(body, /!\[\[([^\]|#\n]+?)(?:\.(png|jpe?g|gif|webp|svg|pdf))?\]\]/gi, (match, name, extension) => {
    const target = extension ? `${name.trim()}.${extension}` : name.trim();
    if (extension && PDF_EXTENSION.test(extension)) {
      const src = context.assetHref(`_attachments/${target}`);
      const label = escapeHtml(path.posix.basename(target));
      return hold(`<div class="pdf"><div class="pdf-head">${label}</div><iframe src="${escapeHtml(src)}" title="${label}"></iframe></div>`, true);
    }
    if (extension && IMAGE_EXTENSIONS.test(extension)) {
      const src = context.assetHref(`_attachments/${target}`);
      return hold(`<img src="${escapeHtml(src)}" alt="${escapeHtml(path.posix.basename(target, path.posix.extname(target)))}">`, false);
    }
    // `![[Note]]` embeds a note; the published site links to it rather than repeating it.
    return hold(linkToNote(name.trim(), name.trim(), context), false);
  }).content;

  text = replaceOutsideCode(text, /(?<!!)\[\[([^\]\n]+?)\]\]/g, (match, inner) => {
    const target = wikiLinkTarget(inner);
    if (!target || target.startsWith('#')) return null;
    const alias = inner.includes('|') ? inner.slice(inner.indexOf('|') + 1).trim() : '';
    return hold(linkToNote(target, alias || target, context), false);
  }).content;

  return { text, held };
}

function linkToNote(target, label, context) {
  const page = context.resolve(target);
  if (!page) return `<span class="unlinked">${escapeHtml(label)}</span>`;
  return `<a href="${escapeHtml(hrefBetween(context.pageDir, page))}">${escapeHtml(label)}</a>`;
}

function restoreSyntax(html, held) {
  return html.replace(/<p>MONOSHOLD(\d+)X<\/p>|MONOSHOLD(\d+)X/g, (match, wrapped, bare) => {
    const item = held[Number(wrapped ?? bare)];
    if (!item) return match;
    if (wrapped !== undefined && !item.block) return `<p>${item.html}</p>`;
    return item.html;
  });
}

// A link with a `javascript:`-style target would run in the page; such targets become plain anchors.
function sanitizeLinks(html) {
  return html.replace(/href="\s*(javascript|vbscript|data):[^"]*"/gi, 'href="#"');
}

// Obsidian callouts keep their marker in the file; the page marks the quote so the stylesheet can draw it.
function markCallouts(html) {
  return html.replace(/<blockquote>\n<p>\[!([A-Za-z][\w-]*)\]/g, (match, type) => (
    `<blockquote class="callout callout-${type.toLowerCase()}">\n<p>${marker(type)}`
  ));
}

/** The HTML of one note's body, with its links and embeds resolved against the site (exported for the tests). */
export function renderNoteBody(content, context) {
  const body = stripFrontmatter(String(content ?? '')).replace(/\r\n/g, '\n');
  const { text, held } = holdSyntax(body, context);
  const html = markdownRenderer(context).parse(text, { async: false });
  return markCallouts(sanitizeLinks(restoreSyntax(html, held)));
}

function pageDocument({ title, crumbs, indexHref, body }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${SITE_STYLE}</style></head>
<body><main>
<nav class="crumbs"><a href="${escapeHtml(indexHref)}">Notes</a>${crumbs ? ` / ${escapeHtml(crumbs)}` : ''}</nav>
<h1>${escapeHtml(title)}</h1>
${body}
</main></body></html>
`;
}

function indexDocument(groups) {
  const sections = groups.map(({ folder, notes }) => `<h2>${escapeHtml(folder || 'Notes')}</h2>
<ul class="notes">${notes.map((note) => `<li><a href="${escapeHtml(hrefBetween('', note.page))}">${escapeHtml(note.title)}</a></li>`).join('')}</ul>`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notes</title><style>${SITE_STYLE}</style></head>
<body><main>
<h1>Notes</h1>
${sections.join('\n')}
</main></body></html>
`;
}

function liveNotes(folder) {
  const rows = getDb().prepare(`
    SELECT path, name, title, content FROM notes_index
    WHERE is_dir = 0 AND (trashed_at IS NULL OR trashed_at = '')
    ORDER BY path COLLATE NOCASE
  `).all();
  const scoped = rows.map((row) => ({ ...row, relative: notesRelativePath(row.path) }));
  if (!folder) return scoped;
  const prefix = `${folder.replace(/\/+$/, '')}/`;
  return scoped.filter((row) => row.relative.startsWith(prefix));
}

function aliasesByPath() {
  const byPath = new Map();
  for (const row of getDb().prepare('SELECT path, alias_nfc FROM note_aliases').all()) {
    if (!byPath.has(row.path)) byPath.set(row.path, []);
    byPath.get(row.path).push(row.alias_nfc);
  }
  return byPath;
}

/** Writes the site into `<target>/monos-site`. Returns what was written; refuses a folder it did not make. */
export function publishSite({ target, folder = '' } = {}) {
  if (!target || !path.isAbsolute(target)) throw httpError(400, 'Give the folder as an absolute path');
  let stats;
  try {
    stats = fs.statSync(target);
  } catch {
    throw httpError(400, 'The folder does not exist');
  }
  if (!stats.isDirectory()) throw httpError(400, 'Choose a folder, not a file');

  const outputRoot = path.resolve(target);
  const notesRoot = path.resolve(NOTES_DIR);
  if (outputRoot === notesRoot || outputRoot.startsWith(notesRoot + path.sep)) {
    throw httpError(403, 'Publish to a folder outside the notes: a site inside them would be read back as notes');
  }

  const siteDir = path.join(outputRoot, SITE_FOLDER);
  if (fs.existsSync(siteDir)) {
    if (!fs.existsSync(path.join(siteDir, MARKER))) {
      throw httpError(409, `${SITE_FOLDER} already exists and is not a published site; choose another folder`);
    }
    fs.rmSync(siteDir, { recursive: true, force: true });
  }

  const found = liveNotes(folder.trim().replace(/^\/+|\/+$/g, ''));
  // A locked note is sealed on disk: the site leaves it out rather than publish a page nobody can read.
  const notes = found.filter((note) => !isLockedNote(readTextFile(resolveNotesPath(note.path))));
  const lockedSkipped = found.length - notes.length;
  const aliases = aliasesByPath();
  const byName = new Map();
  for (const note of notes) {
    const page = pagePathOf(note.relative);
    for (const name of noteLinkNames({ name: note.name, name_nfc: note.name.normalize('NFC'), title: note.title }, aliases.get(note.path) || [])) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(page);
    }
  }
  const resolve = (target) => {
    for (const candidate of linkNameCandidates(target)) {
      const pages = byName.get(candidate);
      if (pages) return pages.length === 1 ? pages[0] : null;
    }
    return null;
  };

  const assets = new Set();
  const pages = [];
  for (const note of notes) {
    const page = pagePathOf(note.relative);
    const noteDir = path.posix.dirname(note.relative) === '.' ? '' : path.posix.dirname(note.relative);
    const pageDir = path.posix.dirname(page);
    const assetHref = (src) => {
      if (/^(https?:|data:|mailto:|#)/i.test(String(src || '').trim()) || String(src || '').startsWith('/')) return src;
      const asset = path.posix.normalize(path.posix.join(noteDir, safeDecode(String(src || ''))));
      if (asset.startsWith('..')) return '#';
      assets.add(asset);
      return hrefBetween(pageDir, path.posix.join('assets', asset));
    };
    const context = { pageDir, assetHref, resolve };
    const body = renderNoteBody(note.content, context);
    const crumbs = path.posix.dirname(note.relative) === '.' ? '' : path.posix.dirname(note.relative);
    pages.push({
      page,
      title: note.title?.trim() || note.name.replace(/\.md$/i, ''),
      folder: crumbs,
      html: pageDocument({ title: note.title?.trim() || note.name.replace(/\.md$/i, ''), crumbs, indexHref: hrefBetween(pageDir, 'index.html'), body }),
    });
  }

  fs.mkdirSync(siteDir, { recursive: true });
  for (const item of pages) {
    const full = path.join(siteDir, item.page);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, item.html, 'utf-8');
  }

  let copied = 0;
  const missing = [];
  for (const asset of assets) {
    const source = path.join(NOTES_DIR, asset);
    if (!fs.existsSync(source) || fs.statSync(source).isDirectory()) {
      missing.push(asset);
      continue;
    }
    const destination = path.join(siteDir, 'assets', asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    copied += 1;
  }

  const groups = [];
  for (const item of pages) {
    let group = groups.find((entry) => entry.folder === item.folder);
    if (!group) {
      group = { folder: item.folder, notes: [] };
      groups.push(group);
    }
    group.notes.push(item);
  }
  fs.writeFileSync(path.join(siteDir, 'index.html'), indexDocument(groups), 'utf-8');
  fs.writeFileSync(path.join(siteDir, MARKER), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    pages: pages.length,
    assets: copied,
  }, null, 2)}\n`, 'utf-8');

  return {
    outputDir: siteDir,
    pages: pages.length,
    assets: copied,
    missingAssets: missing,
    lockedSkipped,
  };
}
