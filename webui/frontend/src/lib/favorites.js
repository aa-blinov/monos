/**
 * Favourites: notes the person marks to come back to, apart from the pinned ones (pins lead the board and the sidebar).
 * A favourite is the note's own property `monos-favorite: true`, so it travels with the file to every device and into git,
 * and the list is the property table filtered by it.
 */
import { loadPropertyTableRequest, setPropertyRequest } from './editor-api.js';

// A reserved name, so a person's own `favorite: pizza` is never mistaken for the mark or overwritten by it.
export const FAVORITE_KEY = 'monos-favorite';

/** Whether a note's property list (`[{ key, type, value }]`) marks it as a favourite. */
export function isFavoriteProperties(properties) {
  return (properties || []).some((property) => String(property.key).toLowerCase() === FAVORITE_KEY && property.value === true);
}

export function setFavoriteRequest(path, on) {
  return setPropertyRequest(path, on
    ? { key: FAVORITE_KEY, type: 'checkbox', value: true }
    : { key: FAVORITE_KEY, remove: true });
}

/** The favourite notes, most recently changed first. */
export async function loadFavoriteNotes() {
  const data = await loadPropertyTableRequest({ query: `prop:${FAVORITE_KEY}=true`, sort: 'modified', dir: 'desc' });
  return Array.isArray(data.rows) ? data.rows : [];
}
