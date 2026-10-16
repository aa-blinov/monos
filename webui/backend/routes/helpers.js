import { isThisComputerRequest } from '../lan-access.js';

// Settings that change this computer's own setup (access from other devices, where the notes live)
// are answered to this computer only, whatever token a device has.
export function requireThisComputer(req, res, next) {
  if (!isThisComputerRequest({ remoteAddress: req.socket.remoteAddress, headers: req.headers })) {
    res.status(403).json({ detail: 'Only this computer can change this setting' });
    return;
  }
  next();
}

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
    // The opening of the note with its line breaks: the card turns lists and headings into readable
    // text, and it needs the lines to know where one item ends.
    excerpt: entry.content
      ? stripFrontmatter(entry.content).trim().slice(0, 600)
      : '',
    color: entry.color || null,
    category: entry.category || '',
    tags: parseTags(entry.tags),
    modified: entry.modified_at || null,
    lastOpened: entry.last_opened,
    boardOrder: entry.board_order ?? null,
    trashedAt: entry.trashed_at || null,
  };
}
