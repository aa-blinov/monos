/**
 * Search in the Help. Every word of the query must be found in a topic (its title or text, Markdown marks
 * ignored, ё read as е); topics whose title matches come first. Each result carries a short excerpt around the
 * first match, so the list says why it was found.
 */

const normalize = (text) => String(text || '').toLowerCase().replace(/ё/g, 'е');

/** Text without Markdown marks, as the reader sees it. */
export function plainText(markdown) {
  return String(markdown || '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[-*>#]+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(text, word, radius = 70) {
  const at = normalize(text).indexOf(word);
  if (at < 0) return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '');
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + word.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/**
 * @param {Array<{ id: string, title: string, items: Array<{ id: string, title: string, body: string }> }>} sections
 * @param {string} query
 * @returns {Array<{ sectionId: string, sectionTitle: string, itemId: string, title: string, excerpt: string }>}
 */
export function searchHelp(sections, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const results = [];
  for (const section of sections) {
    for (const item of section.items) {
      const body = plainText(item.body);
      const title = normalize(item.title);
      const haystack = `${title} ${normalize(section.title)} ${normalize(body)}`;
      if (!words.every((word) => haystack.includes(word))) continue;
      const inTitle = words.filter((word) => title.includes(word)).length;
      results.push({
        sectionId: section.id,
        sectionTitle: section.title,
        itemId: item.id,
        title: item.title,
        excerpt: excerpt(body, words.find((word) => normalize(body).includes(word)) || words[0]),
        score: inTitle,
      });
    }
  }
  return results.sort((a, b) => b.score - a.score).map(({ score, ...result }) => result);
}
