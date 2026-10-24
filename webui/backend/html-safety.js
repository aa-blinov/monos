// The HTML the app makes from a note (the printed sheet, the published site) is made from text someone else may have
// written: a note from an imported archive, a clip, a synced repository. Markdown lets raw HTML through, and a link
// is only as safe as its scheme, so everything that leaves for a browser goes through the filter below: a short list
// of tags and attributes, and links that are web addresses, mail, a phone number, an anchor or a relative path.

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl',
  'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li', 'mark',
  'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'u', 'ul',
]);
const VOID_TAGS = new Set(['br', 'col', 'hr', 'img', 'input']);
const GLOBAL_ATTRIBUTES = new Set(['class', 'title', 'lang', 'dir']);
const TAG_ATTRIBUTES = {
  a: new Set(['href']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'align']),
  th: new Set(['colspan', 'rowspan', 'align', 'scope']),
  ol: new Set(['start', 'type']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  details: new Set(['open']),
  input: new Set(['type', 'checked', 'disabled']),
};
const URL_ATTRIBUTES = new Set(['href', 'src']);
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
// What a browser skips inside a link's scheme (`java<tab>script:` still runs): controls, spaces, soft hyphens, zero-width
// and line-separator characters. Written by code point so no invisible character sits in this file.
const IGNORED_IN_SCHEME = new RegExp(`[\\x00-\\x20\\x7f-\\x9f${String.fromCharCode(0xad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff)}]`, 'g');
const SAFE_IMAGE_DATA = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*$/i;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', lpar: '(', rpar: ')', sol: '/', bsol: '\\',
  excl: '!', num: '#', semi: ';', comma: ',', period: '.', nbsp: ' ',
};

/** The characters a value stands for once a browser has read its entities (`&#106;` is `j`, `&colon;` is `:`). */
function decodeEntities(value) {
  return String(value).replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));?/g, (whole, decimal, hex, name) => {
    if (name !== undefined) return Object.hasOwn(NAMED_ENTITIES, name.toLowerCase()) ? NAMED_ENTITIES[name.toLowerCase()] : whole;
    const code = decimal !== undefined ? Number(decimal) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

/**
 * Whether a link target is one the output may carry. The target is read the way a browser reads it: entities decoded,
 * the whitespace and control characters it ignores inside a scheme removed, and then the scheme must be on the list.
 * A target with no scheme at all (a relative path, `#anchor`, `?query`) is fine.
 */
export function isSafeUrl(value, { image = false } = {}) {
  const target = decodeEntities(value).replace(IGNORED_IN_SCHEME, '');
  if (target === '') return true;
  const colon = target.indexOf(':');
  const firstSeparator = target.search(/[/?#]/);
  if (colon === -1 || (firstSeparator !== -1 && firstSeparator < colon)) return true;
  const scheme = target.slice(0, colon).toLowerCase();
  if (SAFE_SCHEMES.has(scheme)) return true;
  return image && scheme === 'data' && SAFE_IMAGE_DATA.test(target);
}

// The tag at `start` (a `<`): its end index and its parts, or null when it is not a tag. Quotes are honoured, so a `>`
// inside an attribute value does not end the tag early.
function readTag(html, start, limits) {
  const closing = html[start + 1] === '/';
  let index = start + (closing ? 2 : 1);
  const nameStart = index;
  while (index < html.length && /[A-Za-z0-9:-]/.test(html[index])) index += 1;
  if (index === nameStart || !/[A-Za-z]/.test(html[nameStart])) return null;
  const name = html.slice(nameStart, index).toLowerCase();
  const attributes = [];
  while (index < html.length) {
    while (index < html.length && /[\s/]/.test(html[index])) index += 1;
    if (html[index] === '>') return { end: index + 1, name, closing, attributes };
    const attributeStart = index;
    while (index < html.length && !/[\s/=>]/.test(html[index])) index += 1;
    const attributeName = html.slice(attributeStart, index).toLowerCase();
    if (index === attributeStart) { index += 1; continue; }
    while (index < html.length && /\s/.test(html[index])) index += 1;
    let attributeValue = '';
    if (html[index] === '=') {
      index += 1;
      while (index < html.length && /\s/.test(html[index])) index += 1;
      const quote = html[index];
      if (quote === '"' || quote === "'") {
        // No closing quote anywhere after this point means none for any later tag either: it is looked up once.
        if (index + 1 > limits.lastQuote[quote]) return null;
        const close = html.indexOf(quote, index + 1);
        if (close === -1) return null;
        attributeValue = html.slice(index + 1, close);
        index = close + 1;
      } else {
        const valueStart = index;
        while (index < html.length && !/[\s>]/.test(html[index])) index += 1;
        attributeValue = html.slice(valueStart, index);
      }
    }
    attributes.push([attributeName, attributeValue]);
  }
  return null;
}

function rebuildTag({ name, closing, attributes }) {
  if (closing) return VOID_TAGS.has(name) ? '' : `</${name}>`;
  const allowed = TAG_ATTRIBUTES[name] || new Set();
  const kept = [];
  const seen = new Set();
  let inputIsCheckbox = false;
  for (const [attribute, value] of attributes) {
    if (seen.has(attribute) || !(GLOBAL_ATTRIBUTES.has(attribute) || allowed.has(attribute))) continue;
    if (URL_ATTRIBUTES.has(attribute) && !isSafeUrl(value, { image: name === 'img' })) continue;
    if (name === 'input' && attribute === 'type') {
      if (decodeEntities(value).trim().toLowerCase() !== 'checkbox') continue;
      inputIsCheckbox = true;
    }
    seen.add(attribute);
    kept.push(value === '' && !['alt', 'title'].includes(attribute) ? attribute : `${attribute}="${value.replace(/"/g, '&quot;')}"`);
  }
  // A form control other than a ticked or empty box is not something a note may bring along.
  if (name === 'input' && !inputIsCheckbox) return '';
  // A link that lost its target is still text, and one that kept it must not open in a window with a hold on the page.
  const hasLink = name === 'a' && seen.has('href');
  return `<${name}${kept.length ? ` ${kept.join(' ')}` : ''}${hasLink ? ' rel="noopener noreferrer"' : ''}>`;
}

/**
 * The same HTML with only the allowed tags and attributes. A tag that is not on the list is not removed but shown as
 * the text it is (`&lt;script&gt;`), so a note that talks about HTML still reads as it was written; the text between
 * tags is left as the renderer made it.
 */
export function sanitizeHtml(html) {
  const text = String(html ?? '');
  const limits = { lastQuote: { '"': text.lastIndexOf('"'), "'": text.lastIndexOf("'") } };
  const lastClose = text.lastIndexOf('>');
  // A tag that never ends costs a look to the end of the text; this much work in all, and the rest is plain text.
  let budget = text.length * 4 + 1000;
  let out = '';
  let position = 0;
  while (position < text.length) {
    const open = text.indexOf('<', position);
    if (open === -1) {
      out += text.slice(position);
      break;
    }
    out += text.slice(position, open);
    if (open > lastClose || budget < 0) {
      out += text.slice(open).replace(/</g, '&lt;');
      break;
    }
    if (text.startsWith('<!--', open)) {
      const close = text.indexOf('-->', open + 4);
      position = close === -1 ? text.length : close + 3;
      continue;
    }
    const tag = readTag(text, open, limits);
    if (!tag) {
      budget -= 64;
      out += '&lt;';
      position = open + 1;
      continue;
    }
    out += ALLOWED_TAGS.has(tag.name) ? rebuildTag(tag) : text.slice(open, tag.end).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    position = tag.end;
  }
  return out;
}

/** The headers every page of notes that the server hands to a browser carries. */
export const NOTE_PAGE_POLICY = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export function noteHtmlHeaders(res) {
  res.set({
    'Content-Security-Policy': NOTE_PAGE_POLICY,
    'X-Content-Type-Options': 'nosniff',
  });
}
