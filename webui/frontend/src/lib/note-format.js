export function displayNoteName(note) {
  return String(note?.name || note?.path?.split('/').pop() || '').replace(/\.md$/i, '');
}

export function recentPathLabel(note, fallback = '') {
  const rawPath = String(note?.path || '');
  return rawPath
    .replace(/^notes\/?/, '')
    .replace(/\/?[^/]*\.md$/i, '')
    .replace(/\/$/, '') || fallback;
}
