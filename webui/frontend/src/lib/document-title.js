// The tab of a browser says where the person is: "Trash — Monos", "CV — Monos" for a note (the desktop window
// names a note the same way), and plain "Monos" on the board.
export const APP_NAME = 'Monos';

function lastSegment(route) {
  const segment = String(route || '').split('/').filter(Boolean).pop() || '';
  try {
    return decodeURIComponent(segment).replace(/\.md$/i, '');
  } catch {
    return segment.replace(/\.md$/i, '');
  }
}

/**
 * @param {{ route: string, noteTitle?: string, texts: object }} options `texts` is the interface text of the language
 */
export function documentTitle({ route, noteTitle = '', texts }) {
  const path = String(route || '/').split('?')[0].replace(/\/+$/, '') || '/';
  let page = '';
  if (path === '/') page = '';
  else if (path.startsWith('/notes/')) page = noteTitle || lastSegment(path);
  else if (path === '/settings') page = texts.settings.title;
  else if (path === '/trash') page = texts.trash.title;
  else if (path === '/templates') page = texts.templates.title;
  else if (path === '/properties') page = texts.properties.tableTitle;
  else if (path === '/attachments') page = texts.attachments.title;
  else if (path === '/favorites') page = texts.favorites.title;
  else if (path === '/map') page = texts.map.title;
  else if (path === '/help') page = texts.help.title;
  else page = texts.app.notFound.title;
  return page ? `${page} — ${APP_NAME}` : APP_NAME;
}
