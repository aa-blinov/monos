import { isThisComputerRequest } from '../lan-access.js';
import { withoutConflictMarkers } from '../conflict-markers.js';

export { sendError } from '../api-errors.js';

// Settings that change this computer's own setup (access from other devices, where the notes live)
// are answered to this computer only, whatever token a device has.
export function requireThisComputer(req, res, next) {
  if (!isThisComputerRequest({ remoteAddress: req.socket.remoteAddress, headers: req.headers })) {
    res.status(403).json({ detail: 'Only this computer can change this setting', code: 'this_computer_only' });
    return;
  }
  next();
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
  const trashed = Boolean(entry.trashed_at);
  const conflict = Boolean(entry.conflict);
  // The text a card shows is the note's own. A conflicted note shows this device's side without the markers, and a
  // locked one has none: its text is sealed and the index holds nothing of it.
  const text = entry.content ? (conflict ? withoutConflictMarkers(entry.content) : entry.content) : '';
  return {
    // A note in the trash is named by the place it was deleted from: that is what the page shows and what it sends
    // back to restore it. Its own place under `.trash/` is `trashPath`.
    path: trashed && entry.original_path ? entry.original_path : entry.path,
    ...(trashed ? { trashPath: entry.path } : {}),
    name: entry.title?.trim() || entry.name.replace('.md', ''),
    // The opening of the note with its line breaks: the card turns lists and headings into readable
    // text, and it needs the lines to know where one item ends.
    excerpt: text
      ? stripFrontmatter(text).trim().slice(0, 600)
      : '',
    color: entry.color || null,
    category: entry.category || '',
    tags: parseTags(entry.tags),
    modified: entry.modified_at || null,
    lastOpened: entry.last_opened,
    boardOrder: entry.board_order ?? null,
    pinned: Boolean(entry.pinned),
    trashedAt: entry.trashed_at || null,
    locked: Boolean(entry.locked),
    conflict,
  };
}
