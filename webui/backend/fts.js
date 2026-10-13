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
  `);
}

function quote(value) {
  return String(value ?? '').replace(/"/g, '""');
}

/**
 * Turn a user term into a safe trigram substring query, or `null` when trigram
 * cannot represent it.
 *
 * Punctuation is kept on purpose: trigram indexes arbitrary characters, and
 * `b.md` has to match the file name `b.md`. Only double quotes are escaped,
 * because the term is wrapped in a quoted FTS phrase.
 */
function ftsTerm(term) {
  const cleaned = String(term || '').replace(/"/g, '').trim();
  if (!cleaned) return null;
  // A term shorter than a trigram would match nothing, and returning "no
  // matches" is how an accelerator quietly eats real results.
  if ([...cleaned].length < MIN_TRIGRAM_LENGTH) return null;
  return `"${quote(cleaned)}"`;
}

export function indexNoteForFts(db, note) {
  if (!note?.path) return;
  db.prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ?`).run(note.path);
  if (note.is_dir) return;
  db.prepare(`
    INSERT INTO ${FTS_TABLE} (path, name, title, tags, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    note.path,
    quote(note.name || ''),
    quote(note.title || ''),
    quote(note.tags || ''),
    quote(note.content || '')
  );
}

export function removeNoteFromFts(db, path) {
  db.prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ?`).run(path);
}

export function rebuildFts(db) {
  ensureFtsSchema(db);
  db.exec(`DELETE FROM ${FTS_TABLE}`);
  const rows = db.prepare(`
    SELECT path, name, title, tags, content, is_dir
    FROM notes_index
    WHERE is_dir = 0
  `).all();
  const insert = db.transaction((items) => {
    for (const row of items) indexNoteForFts(db, row);
  });
  insert(rows);
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
  return indexed === expected && indexed > 0;
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
    rows = db.prepare(`
      SELECT path FROM ${FTS_TABLE} WHERE ${FTS_TABLE} MATCH ?
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