function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return rawTags.map(tag => String(tag).trim()).filter(Boolean);
  }

  if (!rawTags) return [];

  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.map(tag => String(tag).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function extractSearchTerms(query) {
  const cleanQuery = String(query || '').replace(/^#/, '').trim();
  if (!cleanQuery) return { cleanQuery: '', terms: [] };

  const terms = Array.from(new Set(
    cleanQuery
      .toLowerCase()
      .split(/\s+/)
      .map(term => term.trim())
      .filter(Boolean)
  ));

  return {
    cleanQuery: cleanQuery.toLowerCase(),
    terms,
  };
}

/** Split on whitespace, keeping a quoted run in one piece. */
function tokenizeQuery(input) {
  const tokens = [];
  let buffer = '';
  let inQuote = false;
  for (const char of String(input || '')) {
    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(char)) {
      if (buffer) tokens.push(buffer);
      buffer = '';
      continue;
    }
    buffer += char;
  }
  if (buffer) tokens.push(buffer);
  return tokens;
}

/** `body:"exact phrase"` → `{ name: 'body', value: 'exact phrase' }`. */
function readOperatorToken(token) {
  const match = /^(-?)([A-Za-z]+):(.+)$/.exec(token);
  if (!match) return null;
  const name = match[2].toLowerCase();
  if (name !== 'body' && name !== 'updated') return null;
  return { negated: match[1] === '-', name, value: match[3] };
}

function pushTerm(bucket, value) {
  const lower = String(value || '').toLowerCase().trim();
  if (lower) bucket.push(lower);
}

/**
 * Split a query into free text plus `body:` and `updated:` filters.
 *
 *   `report body:quarterly`  → text "report", body ["quarterly"]
 *   `body:"cost centre"`     → body ["cost centre"]
 *   `updated:2026-10`        → updated ["2026-10"]
 *   `-body:draft`            → a negated body filter
 *
 * `body:` keeps swallowing plain words after it (`body:cost centre` reads as
 * two body terms, not one term plus a free-text one) because that is what the
 * operator means; the run stops at the next `operator:` token. Repeating an
 * operator widens it, matching the switcher.
 *
 * @param {string} rawQuery
 * @returns {{ text: string[], body: { terms: string[], negated: boolean }, updated: { values: string[], negated: boolean } }}
 */
export function parseSearchQuery(rawQuery) {
  const tokens = tokenizeQuery(String(rawQuery || '').replace(/^#/, ''));
  const text = [];
  const body = { terms: [], negated: false };
  const updated = { values: [], negated: false };

  let collecting = null;

  for (const token of tokens) {
    const operator = readOperatorToken(token);
    if (operator) {
      collecting = null;
      if (operator.name === 'body') {
        // `body:` owns everything up to the next operator: `body:cost centre`
        // is two body terms, not one body term plus free text.
        body.negated = body.negated || operator.negated;
        collecting = 'body';
        pushTerm(body.terms, operator.value);
      } else {
        // `updated:` takes a single value, so words after it stay free text.
        updated.negated = updated.negated || operator.negated;
        if (operator.value) updated.values.push(operator.value.toLowerCase());
        else collecting = 'updated';
      }
      continue;
    }

    if (collecting === 'body') pushTerm(body.terms, token);
    else if (collecting === 'updated') updated.values.push(token.toLowerCase());
    else text.push(token.toLowerCase());
  }

  return { text, body, updated };
}

/** Prefix match so `updated:2026-10` finds the whole month. */
function matchesUpdated(entry, filter) {
  const candidates = (Array.isArray(filter.values) ? filter.values : [filter.values])
    .map(value => String(value || '').toLowerCase())
    .filter(Boolean);
  if (candidates.length === 0) return true;

  const modified = String(entry.modified_at || '').toLowerCase();
  if (!modified) return false;
  return candidates.some(value => modified.startsWith(value));
}

function stripWrappingQuotes(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]/, '')
    .replace(/['"]$/, '');
}

function parseFrontmatterTags(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return [];

  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value.replace(/'/g, '"'));
      return Array.isArray(parsed)
        ? parsed.map(tag => stripWrappingQuotes(tag)).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  return value
    .split(',')
    .map(tag => stripWrappingQuotes(tag))
    .filter(Boolean);
}

export function parseFrontmatterMetadata(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { title: '', tags: [], category: '', pinned: false };
  }

  let title = '';
  let tags = [];
  let category = '';
  let pinned = false;

  for (const line of match[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (key === 'title' && rawValue) {
      title = stripWrappingQuotes(rawValue);
    }

    if (key === 'tags' && rawValue) {
      tags = parseFrontmatterTags(rawValue);
    }

    if (key === 'category' && rawValue) {
      category = stripWrappingQuotes(rawValue);
    }

    // Закрепление живёт в файле заметки, а не в браузере: иначе оно не
    // переезжает на другое устройство и не попадает в git.
    if (key === 'pinned') {
      pinned = /^(true|yes|1)$/i.test(stripWrappingQuotes(rawValue));
    }
  }

  return { title, tags, category, pinned };
}

function matchSearchTerms(fields, terms) {
  return terms.every(term => fields.some(field => field.includes(term)));
}

/**
 * Strip the Markdown scaffolding that would otherwise be read aloud on a card.
 *
 * The excerpt comes from the note's raw text, so a note with tasks or a formula
 * used to show its user `[ ] Report` and `$E = mc^2$` on the board. What belongs
 * on a card is the sentence, not the syntax that produces it.
 */
function toPlainExcerptText(content) {
  return String(content || '')
    // fenced code blocks, markers and contents: on a card a block of code is noise
    .replace(/(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\1[ \t]*(?:\n|$)/g, '\n')
    // task markers: `- [x] text` → `text`
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\][ \t]*/gm, '')
    // images and links → their alt text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // wiki-links → the note name
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1')
    // inline and block formulas → the latex, which at least reads as maths
    .replace(/\$\$([^$]*)\$\$/g, (_, latex) => latex.trim())
    .replace(/(?<!\\)\$([^$\n]+?)\$/g, (_, latex) => latex.trim())
    // remaining emphasis, quotes and headings
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/`([^`]*)`/g, '$1');
}

function buildSearchExcerpt(content, cleanQuery, terms) {
  const compactContent = toPlainExcerptText(content).replace(/\s+/g, ' ').trim();
  if (!compactContent) return '';

  const candidates = [cleanQuery, ...terms]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const lowerContent = compactContent.toLowerCase();
  let matchIndex = -1;
  let matchLength = 0;

  for (const candidate of candidates) {
    const idx = lowerContent.indexOf(candidate);
    if (idx !== -1) {
      matchIndex = idx;
      matchLength = candidate.length;
      break;
    }
  }

  if (matchIndex === -1) {
    return compactContent.length > 180
      ? compactContent.slice(0, 180).trimEnd() + '...'
      : compactContent;
  }

  const start = Math.max(0, matchIndex - 70);
  const end = Math.min(compactContent.length, matchIndex + matchLength + 110);
  let excerpt = compactContent.slice(start, end).trim();

  if (start > 0) excerpt = '...' + excerpt;
  if (end < compactContent.length) excerpt += '...';

  return excerpt;
}

function scoreField(field, cleanQuery, terms, weights) {
  let score = 0;

  if (!field) return score;

  // An empty cleanQuery would make `startsWith('')` true and hand every field a
  // prefix bonus; a `body:`-only query must not rank by accident.
  if (cleanQuery) {
    if (field === cleanQuery) score += weights.exact;
    else if (field.startsWith(cleanQuery)) score += weights.prefix;
    else if (field.includes(cleanQuery)) score += weights.contains;
  }

  for (const term of terms) {
    if (field === term) score += weights.termExact;
    else if (field.startsWith(term)) score += weights.termPrefix;
    else if (field.includes(term)) score += weights.termContains;
  }

  return score;
}

function scoreSearchEntry(entry, cleanQuery, terms, searchContent, { optional = false, excerptTerms = [] } = {}) {
  const name = normalizeSearchText(String(entry.name || '').replace(/\.md$/i, ''));
  const title = normalizeSearchText(entry.title);
  const pathText = normalizeSearchText(entry.path);
  const content = normalizeSearchText(entry.content);
  const tags = parseTags(entry.tags);
  const normalizedTags = tags.map(tag => normalizeSearchText(tag));
  const tagText = normalizedTags.join(' ');

  const baseFields = [name, title, pathText, tagText];
  const searchableFields = searchContent ? [...baseFields, content] : baseFields;

  // With `body:` alone there is no free text left to require.
  if (!optional && !matchSearchTerms(searchableFields, terms)) return null;

  let score = 0;

  score += scoreField(name, cleanQuery, terms, {
    exact: 140,
    prefix: 90,
    contains: 55,
    termExact: 42,
    termPrefix: 28,
    termContains: 16,
  });

  score += scoreField(title, cleanQuery, terms, {
    exact: 130,
    prefix: 84,
    contains: 48,
    termExact: 38,
    termPrefix: 24,
    termContains: 14,
  });

  score += scoreField(pathText, cleanQuery, terms, {
    exact: 70,
    prefix: 48,
    contains: 28,
    termExact: 18,
    termPrefix: 12,
    termContains: 8,
  });

  score += scoreField(tagText, cleanQuery, terms, {
    exact: 100,
    prefix: 70,
    contains: 44,
    termExact: 34,
    termPrefix: 20,
    termContains: 12,
  });

  if (searchContent) {
    score += scoreField(content, cleanQuery, terms, {
      exact: 20,
      prefix: 16,
      contains: 12,
      termExact: 8,
      termPrefix: 6,
      termContains: 4,
    });
  }

  if (content && searchContent) {
    const phraseCount = cleanQuery ? content.split(cleanQuery).length - 1 : 0;
    const termHitCount = terms.reduce((total, term) => total + (content.includes(term) ? 1 : 0), 0);
    score += Math.min(phraseCount, 5) * 6;
    score += termHitCount * 3;
  }

  return {
    score,
    // With `body:` alone the free text is empty, so the excerpt would fall back
    // to the head of the note; show the line the operator actually matched.
    excerpt: buildSearchExcerpt(entry.content, cleanQuery, excerptTerms.length ? excerptTerms : terms),
  };
}

function scoreTagSearchEntry(entry, cleanQuery, terms) {
  const tags = parseTags(entry.tags);
  const normalizedTags = tags.map(tag => normalizeSearchText(tag));
  if (!normalizedTags.length) return null;

  if (!terms.every(term => normalizedTags.some(tag => tag.includes(term)))) {
    return null;
  }

  let score = 0;

  for (const tag of normalizedTags) {
    score += scoreField(tag, cleanQuery, terms, {
      exact: 140,
      prefix: 90,
      contains: 56,
      termExact: 38,
      termPrefix: 24,
      termContains: 14,
    });
  }

  return {
    score,
    excerpt: tags.map(tag => `#${tag}`).join(' '),
  };
}

export function searchEntries(entries, { query, searchContent = false, limit = 50 } = {}) {
  const rawQuery = String(query || '').trim();
  const isTagSearch = rawQuery.startsWith('#');

  const parsed = isTagSearch ? null : parseSearchQuery(rawQuery);
  const textTerms = parsed
    ? Array.from(new Set(parsed.text))
    : extractSearchTerms(rawQuery).terms;
  const cleanQuery = parsed ? textTerms.join(' ') : extractSearchTerms(rawQuery).cleanQuery;
  const hasBodyFilter = Boolean(parsed && (parsed.body.terms.length > 0 || parsed.updated.values.length > 0));
  // `body:` is an explicit request to look inside the note, so it searches the
  // content even when the caller did not ask for full-text search.
  const searchBody = Boolean(searchContent) || Boolean(parsed?.body.terms.length);
  const terms = textTerms;

  if ((!cleanQuery || terms.length === 0) && !hasBodyFilter) {
    return [];
  }

  return entries
    .map(entry => {
      if (hasBodyFilter) {
        const bodyHit = parsed.body.terms.length === 0
          || matchSearchTerms([normalizeSearchText(entry.content)], parsed.body.terms);
        if (bodyHit === parsed.body.negated) return null;

        if (parsed.updated.values.length > 0) {
          const updatedHit = matchesUpdated(entry, parsed.updated);
          if (updatedHit === parsed.updated.negated) return null;
        }
      }

      const ranked = isTagSearch
        ? scoreTagSearchEntry(entry, cleanQuery, terms)
        : scoreSearchEntry(entry, cleanQuery, terms, searchBody, {
          optional: terms.length === 0,
          excerptTerms: parsed?.body.terms || [],
        });

      if (!ranked) return null;

      return {
        path: entry.path,
        name: entry.title?.trim() || String(entry.name || '').replace(/\.md$/i, ''),
        excerpt: ranked.excerpt,
        color: entry.color || null,
        category: entry.category || '',
        tags: parseTags(entry.tags),
        score: ranked.score,
        lastOpened: entry.last_opened,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (Date.parse(b.lastOpened) || 0) - (Date.parse(a.lastOpened) || 0);
    })
    .slice(0, limit)
    .map(({ score, ...result }) => result);
}
