/**
 * Dates the app writes into text: note titles and template placeholders.
 *
 * Each interface language has its own convention. Russian reads day first with
 * dots (14.10.2026). Everything else uses ISO (2026-10-14): it sorts correctly and
 * reads the same everywhere. Interface dates are formatted by Intl too, but the one
 * that carries a time comes through here: the Russian date reads as a phrase.
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

const intlLocale = (locale) => (locale === 'ru' ? 'ru-RU' : locale === 'en' ? 'en-US' : locale || 'en-US');
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * The date with the time the interface shows: "19 окт. в 21:22" in Russian, "Oct 19, 09:22 PM"
 * elsewhere. The Russian date reads as a phrase, so its parts are joined by hand instead of
 * by Intl's comma.
 *
 * @param {Date|string|number} value
 * @param {string} locale the interface language
 */
export function interfaceDateTime(value, locale = 'en') {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  if (locale !== 'ru') return new Intl.DateTimeFormat(intlLocale(locale), options).format(date);
  const parts = new Intl.DateTimeFormat('ru-RU', options).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('day')} ${part('month')} в ${part('hour')}:${part('minute')}`;
}

/**
 * A short date for a card: "Today, 07:54", "Yesterday, 18:10", "12 Oct" within the year, "3 Mar 2025"
 * before it. The exact moment goes into the card's tooltip; on the card the day is what matters.
 *
 * @param {Date|string|number} value
 * @param {string} locale the interface language
 * @param {{ today: string, yesterday: string }} words
 * @param {Date} [now]
 */
export function relativeDay(value, locale, words, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const lang = intlLocale(locale);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(date);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return `${words.today}, ${time}`;
  if (days === 1) return `${words.yesterday}, ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(lang, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}
