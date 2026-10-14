// A note's due date is stored as `due: YYYY-MM-DD` in its frontmatter. People type dates
// in the form their language uses, so the field accepts ISO and dotted dates and turns
// whatever parses into the stored form. Anything else is refused rather than guessed.
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DOTTED = /^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})$/;

function daysIn(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * @param {string} text what the user typed into the field
 * @returns {{ ok: true, due: string } | { ok: false }} `due` is '' for an empty field
 */
export function parseDueInput(text) {
  const value = String(text ?? '').trim();
  if (!value) return { ok: true, due: '' };

  let year;
  let month;
  let day;
  const iso = value.match(ISO);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const dotted = value.match(DOTTED);
    if (!dotted) return { ok: false };
    day = Number(dotted[1]);
    month = Number(dotted[2]);
    year = dotted[3].length === 2 ? 2000 + Number(dotted[3]) : Number(dotted[3]);
  }

  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return { ok: false };
  const pad = (n, size) => String(n).padStart(size, '0');
  return { ok: true, due: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` };
}

/**
 * The stored date as the field shows it: dotted for Russian, ISO otherwise. A value that is
 * not a date is shown as it is, so a hand-edited frontmatter line stays visible.
 * @param {string} due
 * @param {string} [locale]
 * @returns {string}
 */
export function formatDueInput(due, locale = 'en') {
  const value = String(due || '');
  const iso = value.match(ISO);
  if (!iso) return value;
  const [, year, month, day] = iso;
  return locale === 'ru' ? `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}` : `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
