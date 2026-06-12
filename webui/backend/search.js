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
    return { title: '', tags: [], category: '' };
  }

  let title = '';
  let tags = [];
  let category = '';

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
  }

  return { title, tags, category };
}

function matchSearchTerms(fields, terms) {
  return terms.every(term => fields.some(field => field.includes(term)));
}

function buildSearchExcerpt(content, cleanQuery, terms) {
  const compactContent = String(content || '').replace(/\s+/g, ' ').trim();
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

  if (field === cleanQuery) score += weights.exact;
  else if (field.startsWith(cleanQuery)) score += weights.prefix;
  else if (field.includes(cleanQuery)) score += weights.contains;

  for (const term of terms) {
    if (field === term) score += weights.termExact;
    else if (field.startsWith(term)) score += weights.termPrefix;
    else if (field.includes(term)) score += weights.termContains;
  }

  return score;
}

function scoreSearchEntry(entry, cleanQuery, terms, searchContent) {
  const name = normalizeSearchText(String(entry.name || '').replace(/\.md$/i, ''));
  const title = normalizeSearchText(entry.title);
  const pathText = normalizeSearchText(entry.path);
  const content = normalizeSearchText(entry.content);
  const tags = parseTags(entry.tags);
  const normalizedTags = tags.map(tag => normalizeSearchText(tag));
  const tagText = normalizedTags.join(' ');

  const baseFields = [name, title, pathText, tagText];
  const searchableFields = searchContent ? [...baseFields, content] : baseFields;

  if (!matchSearchTerms(searchableFields, terms)) return null;

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
    excerpt: buildSearchExcerpt(entry.content, cleanQuery, terms),
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
  const { cleanQuery, terms } = extractSearchTerms(rawQuery);

  if (!cleanQuery || terms.length === 0) {
    return [];
  }

  return entries
    .map(entry => {
      const ranked = isTagSearch
        ? scoreTagSearchEntry(entry, cleanQuery, terms)
        : scoreSearchEntry(entry, cleanQuery, terms, Boolean(searchContent));

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
