export function applyTheme(activeTheme, isDarkMode) {
  // The kit owns the palette: its themes.css selects on these two attributes.
  const root = document.documentElement;
  root.dataset.theme = activeTheme;
  root.dataset.mode = isDarkMode ? 'dark' : 'light';
}

export function applyTypographyVars({
  lineHeight,
  contentWidth,
  editorFontSize,
  fontSize,
  fontFamily,
  lineHeightOptions,
  contentWidthOptions,
  editorFontSizeOptions,
  fontSizeOptions,
  fontOptions,
}) {
  const root = document.documentElement;
  root.style.setProperty('--line-height', lineHeightOptions.find((item) => item.value === lineHeight)?.value_css || '1.625');
  root.style.setProperty('--content-width', contentWidthOptions.find((item) => item.value === contentWidth)?.value_css || '60rem');
  root.style.setProperty('--editor-font-size', editorFontSizeOptions.find((item) => item.value === editorFontSize)?.base || '16px');
  const baseSize = parseFloat(fontSizeOptions.find((item) => item.value === fontSize)?.base) || 16;
  root.style.setProperty('--font-size-base', `${baseSize}px`);
  // The metadata whisper must scale with the UI size. Hard-coded px sizes do
  // not, so bumping the interface size used to grow the headings while leaving
  // the whisper small — inverting the hierarchy. 11px for the metadata whisper and
  // 12px (text-xs) for its labels, at the default 16px base.
  root.style.setProperty('--text-whisper', `${(baseSize * 0.6875).toFixed(2)}px`);
  root.style.setProperty('--text-whisper-lg', `${(baseSize * 0.75).toFixed(2)}px`);
  root.style.setProperty('--font-family', (fontOptions.find((item) => item.name === fontFamily) || fontOptions.find((item) => item.family.includes(fontFamily)))?.family || fontFamily);
}

export function detectDarkMode(themeMode = localStorage.getItem('themeMode') || 'system') {
  if (themeMode === 'dark') return true;
  if (themeMode === 'light') return false;
  return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
}

export function normalizeNotePath(filePath) {
  let rawPath = filePath.replace(/\\/g, '/');
  if (rawPath.startsWith('/')) rawPath = rawPath.substring(1);
  return rawPath.startsWith('notes/') ? rawPath.substring(6) : rawPath;
}
