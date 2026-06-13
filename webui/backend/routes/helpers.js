export function sendError(res, error) {
  res.status(error.statusCode || 500).json({ detail: error.message });
}

export function normalizeMentionText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function stripWikiLinks(content) {
  return String(content || '').replace(/\[\[(.*?)\]\]/g, ' ');
}

export function hasPlainMention(entry, candidates) {
  const content = normalizeMentionText(stripWikiLinks(entry.content));
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeMentionText(candidate);
    return normalizedCandidate && content.includes(normalizedCandidate);
  });
}

export function parseTags(rawTags) {
  try {
    const parsed = JSON.parse(rawTags || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function stripFrontmatter(content) {
  return String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
}

export function noteCardPayload(entry) {
  return {
    path: entry.path,
    name: entry.title?.trim() || entry.name.replace('.md', ''),
    excerpt: entry.content
      ? stripFrontmatter(entry.content).replace(/\s+/g, ' ').trim().slice(0, 180)
      : '',
    color: entry.color || null,
    category: entry.category || '',
    tags: parseTags(entry.tags),
    lastOpened: entry.last_opened,
    boardOrder: entry.board_order ?? null,
  };
}
