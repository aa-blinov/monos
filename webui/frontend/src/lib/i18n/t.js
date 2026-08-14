/**
 * Build a translator function for a given locale.
 *
 * @param {Record<string, object>} dictionaries - keyed by locale; values are nested objects
 * @param {string} locale - active locale (must be a key in `dictionaries`, unless `fallbackLocale` is set)
 * @param {object} [options]
 * @param {string} [options.fallbackLocale='en'] - locale to use when `locale` is missing
 * @returns {(key: string | string[], params?: Record<string, *>) => string}
 */
export function createTranslator(dictionaries, locale, options = {}) {
  const dict = dictionaries[locale]
    || (options.fallbackLocale ? dictionaries[options.fallbackLocale] : undefined)
    || {};

  return function t(key, params) {
    const path = Array.isArray(key) ? key : String(key).split('.');
    const value = getPath(dict, path);

    if (typeof value !== 'string') {
      return path.join('.');
    }

    return interpolate(value, params);
  };
}

function getPath(obj, path) {
  let current = obj;
  for (const segment of path) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (name in params) return String(params[name]);
    return match;
  });
}
