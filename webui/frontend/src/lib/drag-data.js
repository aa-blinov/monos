export const NOTE_LINK_DRAG_TYPE = 'application/x-monos-note-link';

export function noteLinkLabel({ name = '', path = '' } = {}) {
  const rawName = String(name || path.split('/').pop() || '').trim();
  return rawName.replace(/\.md$/i, '');
}

export function noteLinkPayload(note = {}) {
  const safeNote = note || {};
  return {
    path: safeNote.path || '',
    name: noteLinkLabel(safeNote),
  };
}

export function wikiLinkForNote(note = {}) {
  const label = noteLinkLabel(note || {});
  return label ? `[[${label}]]` : '';
}
