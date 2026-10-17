import { getDb } from '../database.js';
import { linkFirstMention, linkNameCandidates, noteLinkNames, phraseRegExp, plainTextForMentions } from '../utils.js';
import { updateNotes } from '../link-rename.js';
import { sendError } from './helpers.js';
import { requireQueryPath } from './validate.js';
import { findConflictCopies } from '../conflict-copies.js';
import { pathsMentioning } from '../fts.js';

// Connections between notes: which links resolve, which notes name a note in plain prose without
// linking to it, which notes have no links at all, and which have gone quiet. Every route reads the
// same resolved link graph, so a link counts the same way everywhere.

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 180;
const MIN_PHRASE_LENGTH = 3;
const LIST_LIMIT = 200;
const MENTION_LIMIT = 30;
const NEIGHBOR_LIMIT = 24;

const displayTitle = (note) => note.title?.trim() || note.name.replace(/\.md$/i, '');
const timeOf = (value) => {
  const time = Date.parse(value || '');
  return Number.isNaN(time) ? 0 : time;
};

// A name a [[link]] can carry: no brackets or pipe, and not a `#heading` (that points into the same note).
const linkable = (name) => !/[[\]|]/.test(name) && !name.startsWith('#');

function aliasesOf(db, notePath) {
  return db.prepare('SELECT alias_nfc FROM note_aliases WHERE path = ?').all(notePath).map((row) => row.alias_nfc);
}

// The notes a link target points at: the first candidate name any note answers to. A name shared
// by several notes gives several paths, so the link stays ambiguous, as it is for resolve-link.
function resolveTarget(byName, target) {
  for (const candidate of linkNameCandidates(target)) {
    const paths = byName.get(candidate);
    if (paths) return paths;
  }
  return [];
}

// The graph needs names, titles and links; the text of a note is read only for the notes a route actually looks
// inside. Loading every note's text for each request (tens of megabytes on a big vault) made opening a note, or
// Settings, a quarter of a second of frozen app.
function linkGraph(db) {
  const readContent = db.prepare('SELECT content FROM notes_index WHERE path = ?');
  const notes = db.prepare(`
    SELECT path, name, name_nfc, title, modified_at, last_opened
    FROM notes_index
    WHERE is_dir = 0 AND (trashed_at IS NULL OR trashed_at = '')
  `).all();
  for (const note of notes) {
    let text;
    Object.defineProperty(note, 'content', {
      enumerable: true,
      get() { return (text ??= readContent.get(note.path)?.content ?? ''); },
    });
  }
  const aliases = new Map();
  for (const row of db.prepare('SELECT path, alias_nfc FROM note_aliases').all()) {
    if (!aliases.has(row.path)) aliases.set(row.path, []);
    aliases.get(row.path).push(row.alias_nfc);
  }

  const byName = new Map();
  for (const note of notes) {
    for (const name of noteLinkNames(note, aliases.get(note.path))) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(note.path);
    }
  }

  const links = db.prepare(`
    SELECT nl.source_path AS source, nl.target_name AS target
    FROM note_links nl
    JOIN notes_index ni ON ni.path = nl.source_path
    WHERE ni.is_dir = 0 AND (ni.trashed_at IS NULL OR ni.trashed_at = '')
  `).all().map((row) => ({ source: row.source, target: row.target, paths: resolveTarget(byName, row.target) }));

  return { notes, aliases, links };
}

// The names a note is mentioned by: its file name, title and aliases, longest first. Names a link
// cannot carry are left out, and so are very short ones, which would match everywhere.
function mentionPhrases(note, aliases = []) {
  return noteLinkNames(note, aliases)
    .filter((phrase) => phrase.length >= MIN_PHRASE_LENGTH && linkable(phrase))
    .sort((a, b) => b.length - a.length);
}

// The first phrase that appears in a note's prose. A plain substring pass runs first, so most
// notes are skipped without the regular expressions.
function findMention(content, phrases) {
  if (!content || phrases.length === 0) return null;
  const haystack = content.normalize('NFC').toLowerCase();
  if (!phrases.some((phrase) => haystack.includes(phrase.toLowerCase()))) return null;
  const plain = plainTextForMentions(content);
  return phrases.find((phrase) => phraseRegExp(phrase).test(plain)) || null;
}

function addEdge(edges, from, to) {
  const key = [from, to].sort().join('\u0000');
  const edge = edges.get(key);
  if (!edge) edges.set(key, { from, to, both: false });
  else if (edge.from !== from) edge.both = true;
}

export function registerConnectionRoutes(app) {
  // Links that name no note, with the notes that contain them.
  app.get('/api/notes/broken-links', (_req, res) => {
    try {
      const { links } = linkGraph(getDb());
      const broken = new Map();
      for (const link of links) {
        if (link.paths.length) continue;
        if (!broken.has(link.target)) broken.set(link.target, new Set());
        broken.get(link.target).add(link.source);
      }
      res.json([...broken.entries()]
        .map(([target, sources]) => ({ target, sources: [...sources].sort() }))
        .sort((a, b) => a.target.localeCompare(b.target))
        .slice(0, LIST_LIMIT));
    } catch (error) {
      sendError(res, error);
    }
  });

  // Notes that name this note in plain prose without linking to it.
  app.get('/api/notes/unlinked-mentions', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      const { notes, aliases, links } = linkGraph(getDb());
      const note = notes.find((item) => item.path === filePath);
      if (!note) return res.json([]);

      const phrases = mentionPhrases(note, aliases.get(filePath));
      const linking = new Set(links.filter((link) => link.paths.includes(filePath)).map((link) => link.source));
      // The text index says which notes can hold the phrase at all; only those are read.
      const candidates = phrases.length ? pathsMentioning(getDb(), phrases) : [];
      const possible = candidates && new Set(candidates);
      const results = [];
      for (const other of notes) {
        if (other.path === filePath || linking.has(other.path)) continue;
        if (possible && !possible.has(other.path)) continue;
        const phrase = findMention(other.content, phrases);
        if (!phrase) continue;
        results.push({ path: other.path, title: displayTitle(other), phrase });
        if (results.length >= MENTION_LIMIT) break;
      }
      res.json(results);
    } catch (error) {
      sendError(res, error);
    }
  });

  // Turns the first plain mention of the target note inside the source note into a link to it:
  // `[[File]]`, or `[[File|mention]]` when the mention is spelled differently.
  app.post('/api/notes/link-mention', (req, res) => {
    try {
      const sourcePath = requireQueryPath(req);
      const targetPath = typeof req.body?.target === 'string' ? req.body.target : '';
      if (!targetPath || targetPath === sourcePath) {
        return res.status(400).json({ detail: 'A note cannot link to itself' });
      }

      const db = getDb();
      const target = db.prepare(`
        SELECT path, name, name_nfc, title FROM notes_index
        WHERE path = ? AND is_dir = 0 AND (trashed_at IS NULL OR trashed_at = '')
      `).get(targetPath);
      if (!target) return res.status(404).json({ detail: 'Target note not found' });

      const linkText = String(target.name_nfc || target.name).normalize('NFC').replace(/\.md$/i, '');
      if (!linkable(linkText)) {
        return res.status(400).json({ detail: 'This note name cannot be written as a link' });
      }
      const phrases = mentionPhrases(target, aliasesOf(db, targetPath));
      const result = updateNotes([sourcePath], (text) => {
        const phrase = findMention(text, phrases);
        return phrase ? linkFirstMention(text, phrase, linkText) : { content: text, count: 0 };
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  // Notes with no resolved link in either direction, and notes nobody has opened or edited for a long time.
  app.get('/api/notes/maintenance', (_req, res) => {
    try {
      const { notes, links } = linkGraph(getDb());
      const connected = new Set();
      for (const link of links) {
        if (!link.paths.length) continue;
        connected.add(link.source);
        for (const path of link.paths) connected.add(path);
      }

      const cutoff = Date.now() - STALE_DAYS * DAY_MS;
      const orphans = [];
      const stale = [];
      for (const note of notes) {
        if (!connected.has(note.path)) orphans.push({ path: note.path, title: displayTitle(note) });
        const activity = Math.max(timeOf(note.last_opened), timeOf(note.modified_at));
        if (activity && activity < cutoff) {
          stale.push({ path: note.path, title: displayTitle(note), lastActivity: new Date(activity).toISOString() });
        }
      }
      orphans.sort((a, b) => a.title.localeCompare(b.title));
      stale.sort((a, b) => a.lastActivity.localeCompare(b.lastActivity));
      const titles = new Map(notes.map((note) => [note.path, displayTitle(note)]));
      const copies = findConflictCopies(notes).map((copy) => ({ ...copy, title: titles.get(copy.path) }));

      res.json({
        orphans: orphans.slice(0, LIST_LIMIT),
        orphanCount: orphans.length,
        stale: stale.slice(0, LIST_LIMIT),
        staleCount: stale.length,
        staleDays: STALE_DAYS,
        conflictCopies: copies.slice(0, LIST_LIMIT),
        conflictCopyCount: copies.length,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // The note with its resolved neighbours (links out and in) and the links between them: the local graph.
  app.get('/api/notes/neighbors', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      const { notes, links } = linkGraph(getDb());
      const center = notes.find((note) => note.path === filePath);
      if (!center) return res.json({ nodes: [], edges: [] });

      const neighbors = new Set();
      for (const link of links) {
        if (link.source === filePath) link.paths.forEach((path) => neighbors.add(path));
        else if (link.paths.includes(filePath)) neighbors.add(link.source);
      }
      neighbors.delete(filePath);

      const byPath = new Map(notes.map((note) => [note.path, note]));
      const shown = [filePath, ...[...neighbors]
        .sort((a, b) => displayTitle(byPath.get(a)).localeCompare(displayTitle(byPath.get(b))))
        .slice(0, NEIGHBOR_LIMIT)];
      const inView = new Set(shown);

      const edges = new Map();
      for (const link of links) {
        if (!inView.has(link.source)) continue;
        for (const target of link.paths) {
          if (target !== link.source && inView.has(target)) addEdge(edges, link.source, target);
        }
      }

      res.json({
        nodes: shown.map((path) => ({ path, title: displayTitle(byPath.get(path)), center: path === filePath })),
        edges: [...edges.values()],
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}
