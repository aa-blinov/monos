/**
 * Full-text index over notes (SQLite FTS5, trigram tokenizer).
 *
 * Before this existed, `/api/search` pulled every note — body included — into
 * JavaScript and matched it with `String.includes`. That is fine for a hundred
 * notes and hopeless for ten thousand. Here SQLite does the matching and
 * returns only the rows that can plausibly match; the existing scoring in
 * `search.js` still runs on those rows, so ranking and excerpts are unchanged.
 *
 * **Why trigram and not the usual unicode61.** The first version of this file
 * used `unicode61`, which indexes whole words. Comparing both paths over the
 * real corpus showed it silently dropping results: `сеть` has to match
 * «подсеть», `план` — «планка», `rag` — «fragment», because the old scan did
 * substring matching. Trigram indexes every three-character sequence, so it
 * reproduces `includes()` semantics exactly.
 *
 * Trigram cannot help when a term is shorter than three characters, and it
 * cannot express "must NOT contain". In both cases `searchFts` returns `null`
 * and the caller falls back to the full scan — slow, but correct. A note is
 * never lost because the index could not represent the query.
 */

const FTS_TABLE = 'notes_fts';
// Which FTS row belongs to which note. `DELETE FROM notes_fts WHERE path = ?` has no index to use and reads the
// whole table: one pass per note made indexing grow with the square of the vault (a minute at 5000 notes).
// Rows are deleted by rowid instead, and this table is where the rowid comes from.
const FTS_IDS = 'notes_fts_ids';
// What the rows of the index look like. 2: text and queries are both in Unicode form NFC, and a double quote is
// stored as it is (version 1 doubled it and normalised nothing, so `dont"stop` and a decomposed `Café` were never
// found). An index of an older format is filled again from the notes.
const FTS_META = 'notes_fts_meta';
const FTS_FORMAT = '2';
const MIN_TRIGRAM_LENGTH = 3;
// Above this share of the corpus, narrowing buys nothing: the plain scan
// already has to touch every row, and the index only adds an oversized
// `IN (…)` clause. Measured on 20k notes, a term in 1% of notes ran ~10× faster
// through FTS, while a term in every note ran ~25% slower.
const MAX_CANDIDATE_RATIO = 0.5;
// Below this corpus size the plain scan is a couple of microseconds, so there is
// nothing to gain and no reason to judge selectivity.
const MIN_CORPUS_FOR_SELECTIVITY = 20;

export function ensureFtsSchema(db) {
  // An older build created this table with the `unicode61` tokenizer. Keeping it
  // would look fine and quietly return fewer results, so replace it outright.
  const existing = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(FTS_TABLE);
  if (existing && !/trigram/i.test(existing.sql || '')) {
    db.exec(`DROP TABLE IF EXISTS ${FTS_TABLE}`);
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
      path,
      name,
      title,
      tags,
      content,
      tokenize = 'trigram'
    );
    CREATE TABLE IF NOT EXISTS ${FTS_IDS} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS ${FTS_META} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // An index with no rows has none of an older format to distrust: it is written in the current one from the start.
  // One that has rows and no marker was made before the marker existed, and is filled again.
  const marked = db.prepare(`SELECT 1 FROM ${FTS_META} WHERE key = 'format'`).get();
  if (!marked && (db.prepare(`SELECT COUNT(*) AS c FROM ${FTS_TABLE}`).get()?.c ?? 0) === 0) {
    db.prepare(`INSERT INTO ${FTS_META} (key, value) VALUES ('format', ?)`).run(FTS_FORMAT);
  }
}

// Statements are compiled once per connection: compiling them again for every note was a visible share of a reindex.
const statements = new WeakMap();
function stmt(db, key, sql) {
  let byKey = statements.get(db);
  if (!byKey) statements.set(db, (byKey = new Map()));
  let prepared = byKey.get(key);
  if (!prepared) byKey.set(key, (prepared = db.prepare(sql)));
  return prepared;
}

function ftsRowId(db, notePath, create) {
  const row = stmt(db, 'idOf', `SELECT id FROM ${FTS_IDS} WHERE path = ?`).get(notePath);
  if (row) return row.id;
  if (!create) return null;
  return Number(stmt(db, 'newId', `INSERT INTO ${FTS_IDS} (path) VALUES (?)`).run(notePath).lastInsertRowid);
}

// The same text in the same Unicode form on both sides: macOS file names and pasted text come decomposed (NFD), what a
// person types is composed (NFC), and trigrams of the two do not match.
const nfc = (value) => String(value ?? '').normalize('NFC');

/**
 * Turn a user term into a safe trigram substring query, or `null` when trigram
 * cannot represent it.
 *
 * Punctuation is kept on purpose: trigram indexes arbitrary characters, and
 * `b.md` has to match the file name `b.md`. A double quote is doubled, which
 * is how a quoted FTS phrase holds one: `dont"stop` is found as written.
 */
function ftsTerm(term) {
  const cleaned = nfc(term).trim();
  if (!cleaned) return null;
  // A term shorter than a trigram would match nothing, and returning "no
  // matches" is how an accelerator quietly eats real results.
  if ([...cleaned].length < MIN_TRIGRAM_LENGTH) return null;
  return `"${cleaned.replace(/"/g, '""')}"`;
}

function writeFtsRow(db, id, note) {
  stmt(db, 'insert', `INSERT INTO ${FTS_TABLE} (rowid, path, name, title, tags, content) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    nfc(note.path),
    nfc(note.name),
    nfc(note.title),
    nfc(note.tags),
    nfc(note.content)
  );
}

export function indexNoteForFts(db, note) {
  if (!note?.path) return;
  if (note.is_dir) return removeNoteFromFts(db, note.path);
  const id = ftsRowId(db, note.path, true);
  stmt(db, 'deleteRow', `DELETE FROM ${FTS_TABLE} WHERE rowid = ?`).run(id);
  writeFtsRow(db, id, note);
}

export function removeNoteFromFts(db, path) {
  const id = ftsRowId(db, path, false);
  if (id === null) return;
  stmt(db, 'deleteRow', `DELETE FROM ${FTS_TABLE} WHERE rowid = ?`).run(id);
  stmt(db, 'deleteId', `DELETE FROM ${FTS_IDS} WHERE id = ?`).run(id);
}

/** Fills the index from `notes_index` in one pass, without the per-note delete: it starts from empty. */
export function rebuildFts(db) {
  ensureFtsSchema(db);
  const rows = db.prepare(`
    SELECT path, name, title, tags, content
    FROM notes_index
    WHERE is_dir = 0
  `).all();
  const fill = db.transaction((items) => {
    db.exec(`DELETE FROM ${FTS_TABLE}`);
    db.exec(`DELETE FROM ${FTS_IDS}`);
    for (const row of items) writeFtsRow(db, ftsRowId(db, row.path, true), row);
    db.prepare(`INSERT OR REPLACE INTO ${FTS_META} (key, value) VALUES ('format', ?)`).run(FTS_FORMAT);
  });
  fill(rows);
  return rows.length;
}

/**
 * Is the index populated and in step with `notes_index`?
 * A mismatch means a note was written without the index being updated, so we
 * must not trust a "no match" answer from it.
 */
export function ftsInSync(db) {
  let indexed;
  try {
    indexed = db.prepare(`SELECT COUNT(*) AS c FROM ${FTS_TABLE}`).get()?.c ?? 0;
  } catch {
    return false;
  }
  const expected = db.prepare('SELECT COUNT(*) AS c FROM notes_index WHERE is_dir = 0').get()?.c ?? 0;
  // The rowid map must agree too: an index from before the map existed has rows nothing can delete by rowid.
  let mapped = -1;
  try { mapped = db.prepare(`SELECT COUNT(*) AS c FROM ${FTS_IDS}`).get()?.c ?? 0; } catch { /* no map yet */ }
  // Rows written by an older format cannot be trusted either way, even when they are all there.
  let format = null;
  try { format = db.prepare(`SELECT value FROM ${FTS_META} WHERE key = 'format'`).get()?.value ?? null; } catch { /* no marker yet */ }
  return indexed === expected && indexed > 0 && mapped === indexed && format === FTS_FORMAT;
}

/**
 * Candidate paths for a query.
 *
 * Takes the result of `parseSearchQuery` directly, so the two cannot drift.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ text?: string[], body?: { terms?: string[], negated?: boolean } | string[] }} parsed
 * @param {{ searchContent?: boolean }} options
 * @returns {string[] | null} paths, or `null` when the index cannot be trusted
 */
export function searchFts(db, parsed, { searchContent = false } = {}) {
  if (!ftsInSync(db)) return null;

  const bodyObject = Array.isArray(parsed?.body) ? null : parsed?.body;
  if (bodyObject?.negated) return null;

  // When the caller searches bodies too, a free-text term may live only in the
  // content — excluding content here would silently drop results the plain scan
  // would have found, which is the one failure mode an accelerator must not have.
  const metaFields = searchContent
    ? ['path', 'name', 'title', 'tags', 'content']
    : ['path', 'name', 'title', 'tags'];

  const textTerms = parsed?.text || [];
  const bodyTerms = Array.isArray(parsed?.body) ? parsed.body : parsed?.body?.terms || [];

  const clauses = [];
  for (const term of textTerms) {
    const safe = ftsTerm(term);
    if (!safe) return null;
    clauses.push(`(${metaFields.map((field) => `${field} : ${safe}`).join(' OR ')})`);
  }
  for (const term of bodyTerms) {
    const safe = ftsTerm(term);
    if (!safe) return null;
    clauses.push(`content : ${safe}`);
  }
  // `path:` и `tag:` тоже умеют в индексе: и path, и tags — его колонки.
  // Без этого быстрый путь молча выкидывал бы фильтр, и `path:base/EORA`
  // отвечал бы так же, как обычный текстовый запрос.
  for (const [bucket, column] of [[parsed?.path, 'path'], [parsed?.tag, 'tags']]) {
    if (bucket?.exclude?.length) return null; // исключения умеет только перебор
    for (const value of bucket?.values || []) {
      const safe = ftsTerm(value);
      if (!safe) return null;
      clauses.push(`${column} : ${safe}`);
    }
  }
  if (clauses.length === 0) return null;

  let rows;
  try {
    // Column filters (`title : term`) are FTS query syntax, so they belong in a
    // MATCH clause, not in WHERE.
    // The path comes from the rowid map, not from the text index: the text index keeps it in Unicode form NFC for
    // searching, and the disk may spell it otherwise.
    rows = db.prepare(`
      SELECT ids.path AS path FROM ${FTS_TABLE} JOIN ${FTS_IDS} ids ON ids.id = ${FTS_TABLE}.rowid
      WHERE ${FTS_TABLE} MATCH ?
    `).all(clauses.join(' AND '));
  } catch {
    // A malformed query must never take search down; fall back to the scan.
    return null;
  }

  // A query that matches most of the corpus is not worth narrowing.
  const total = db.prepare('SELECT COUNT(*) AS c FROM notes_index WHERE is_dir = 0').get()?.c ?? 0;
  if (total >= MIN_CORPUS_FOR_SELECTIVITY && rows.length > total * MAX_CANDIDATE_RATIO) return null;

  return rows.map((row) => row.path);
}

/**
 * The notes whose text may contain one of these phrases — a superset of the real mentions, for the caller to
 * confirm. `null` when the index cannot answer (out of step, or a phrase shorter than a trigram), so the caller
 * reads every note instead.
 */
export function pathsMentioning(db, phrases) {
  if (!ftsInSync(db)) return null;
  // The index holds NFC text, so a phrase is asked in NFC whatever form it arrives in.
  const terms = [...new Set(phrases.map(nfc))].map(ftsTerm);
  if (!terms.length || terms.some((term) => !term)) return null;
  try {
    return db.prepare(`
      SELECT ids.path AS path FROM ${FTS_TABLE} JOIN ${FTS_IDS} ids ON ids.id = ${FTS_TABLE}.rowid
      WHERE ${FTS_TABLE} MATCH ?
    `)
      .all(terms.map((term) => `content : ${term}`).join(' OR '))
      .map((row) => row.path);
  } catch {
    return null;
  }
}
