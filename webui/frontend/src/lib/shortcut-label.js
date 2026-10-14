// On macOS the modifier is ⌘ and Shift is ⇧; elsewhere the labels stay as written.
// Strings keep "Ctrl+" as the source form so one text serves every platform.
export function isMacPlatform() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
}

/**
 * @param {string} text a shortcut written as `Ctrl+K` or `Ctrl+Shift+F`
 * @param {boolean} [mac] whether to render the macOS symbols
 * @returns {string}
 */
export function shortcutLabel(text, mac = isMacPlatform()) {
  const value = String(text || '');
  if (!mac) return value;
  return value.replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧');
}
