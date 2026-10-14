/**
 * Dates the app writes into text: note titles and template placeholders.
 *
 * Each interface language has its own convention. Russian reads day first with
 * dots (14.10.2026). Everything else uses ISO (2026-10-14): it sorts correctly and
 * reads the same everywhere. Dates shown in the interface (note headers, file info)
 * are formatted by Intl and do not come through here.
 */

const pad = (value) => String(value).padStart(2, '0');

/** The date as people in this language write it: 14.10.2026 for ru, 2026-10-14 otherwise. */
export function localeDate(date = new Date(), locale = 'en') {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  return locale === 'ru' ? `${day}.${month}.${year}` : `${year}-${month}-${day}`;
}

/** Month only, for the budget and other monthly notes: 10.2026 for ru, 2026-10 otherwise. */
export function localeMonth(date = new Date(), locale = 'en') {
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  return locale === 'ru' ? `${month}.${year}` : `${year}-${month}`;
}

/**
 * Title stamp for quick and daily notes: the date, then the time. Dashes stand in
 * for the colons, which file names cannot hold, and the seconds keep two quick notes
 * made in the same minute apart.
 */
export function localeStamp(date = new Date(), locale = 'en') {
  return `${localeDate(date, locale)} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}
