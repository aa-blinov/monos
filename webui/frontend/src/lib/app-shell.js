export function applyTheme(activeTheme, isDarkMode, themes) {
  const theme = themes[activeTheme];
  if (!theme) return;

  const vars = isDarkMode ? theme.dark : theme.light;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
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
  root.style.setProperty('--content-width', contentWidthOptions.find((item) => item.value === contentWidth)?.value_css || '80rem');
  root.style.setProperty('--editor-font-size', editorFontSizeOptions.find((item) => item.value === editorFontSize)?.base || '16px');
  root.style.setProperty('--font-size-base', fontSizeOptions.find((item) => item.value === fontSize)?.base || '14px');
  root.style.setProperty('--font-family', fontOptions.find((item) => item.family.includes(fontFamily) || item.name === fontFamily)?.family || fontFamily);
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
