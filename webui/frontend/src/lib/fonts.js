export const fontOptions = [
  // The system's own interface font (San Francisco on a Mac, Segoe UI on Windows): nothing to load, native look.
  { name: 'System', family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif', category: 'system' },
  { name: 'JetBrains Mono', family: '"JetBrains Mono", ui-monospace, monospace', category: 'mono' },
  { name: 'Inter', family: '"Inter", system-ui, sans-serif', category: 'sans' },
  { name: 'Roboto', family: '"Roboto", system-ui, sans-serif', category: 'sans' },
  { name: 'Fira Sans', family: '"Fira Sans", system-ui, sans-serif', category: 'sans' },
  { name: 'IBM Plex Sans', family: '"IBM Plex Sans", system-ui, sans-serif', category: 'sans' },
  { name: 'PT Sans', family: '"PT Sans", system-ui, sans-serif', category: 'sans' },
  { name: 'Noto Sans', family: '"Noto Sans", system-ui, sans-serif', category: 'sans' },
  { name: 'Source Serif 4', family: '"Source Serif 4", ui-serif, Georgia, serif', category: 'serif' },
  { name: 'Georgia', family: 'Georgia, "Times New Roman", ui-serif, serif', category: 'serif' },
  { name: 'PT Serif', family: '"PT Serif", ui-serif, Georgia, serif', category: 'serif' },
  { name: 'IBM Plex Serif', family: '"IBM Plex Serif", ui-serif, Georgia, serif', category: 'serif' },
  { name: 'Fira Code', family: '"Fira Code", ui-monospace, monospace', category: 'mono' },
];

export const fontSizeOptions = [
  { name: 'Small', value: 'small', base: '14px' },
  { name: 'Medium', value: 'medium', base: '16px' },
  { name: 'Large', value: 'large', base: '18px' },
  { name: 'Extra Large', value: 'xlarge', base: '20px' },
];

export const lineHeightOptions = [
  { name: 'Compact', value: 'compact', value_css: '1.3' },
  { name: 'Cozy', value: 'cozy', value_css: '1.45' },
  { name: 'Normal', value: 'normal', value_css: '1.625' },
  { name: 'Spaced', value: 'spaced', value_css: '1.8' },
  { name: 'Relaxed', value: 'relaxed', value_css: '2.0' },
];

export const contentWidthOptions = [
  { name: 'Narrow', value: 'narrow', value_css: '34rem' },
  { name: 'Snug', value: 'snug', value_css: '46rem' },
  { name: 'Medium', value: 'medium', value_css: '60rem' },
  { name: 'Broad', value: 'broad', value_css: '78rem' },
  { name: 'Wide', value: 'wide', value_css: 'none' },
];

export const editorFontSizeOptions = [
  { name: 'XS', value: 'xs', base: '13px' },
  { name: 'Sm', value: 'sm', base: '14px' },
  { name: 'Md', value: 'md', base: '16px' },
  { name: 'Lg', value: 'lg', base: '18px' },
  { name: 'XL', value: 'xl', base: '20px' },
];
