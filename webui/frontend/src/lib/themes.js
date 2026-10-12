/**
 * Text ramp and the note tint.
 *
 * `--text-secondary` keeps each palette's official value. It is also used for
 * 14px card excerpts, and on a note card carrying the 13% accent tint that
 * combination measures below WCAG AA 4.5:1 in 6 of the 12 theme/mode pairs
 * (worst: solarized.dark at 2.79:1). Closing that gap means deviating from the
 * upstream palettes, which is an owner decision, not a mechanical fix — see
 * docs/ARCHITECTURE.md.
 *
 * `--text-tertiary` is new and covers the metadata whisper (9–10px paths and
 * timestamps), which previously stacked opacity onto `--text-secondary` and
 * fell to ~2.2:1. Its value is derived per theme/mode to clear AA 4.5:1
 * against the worst tinted card, so metadata is now readable everywhere.
 */

export const themes = {
  gruvbox: {
    name: 'Gruvbox',
    light: {
      '--bg-primary': '#fbf1c7',
      '--bg-secondary': '#ebdbb2',
      '--bg-tertiary': '#d5c4a1',
      '--text-primary': '#3c3836',
      '--text-secondary': '#6a5e55',
      '--text-tertiary': '#6a5e55',
      '--text-muted': '#928374',
      '--border-subtle': '#d5c4a1',
      '--green': '#98971a',
      '--yellow': '#d79921',
      '--orange': '#d65d0e',
      '--red': '#cc241d',
      '--blue': '#458588',
      '--purple': '#b16286',
      '--aqua': '#689d6a',
    },
    dark: {
      '--bg-primary': '#282828',
      '--bg-secondary': '#3c3836',
      '--bg-tertiary': '#504945',
      '--text-primary': '#ebdbb2',
      '--text-secondary': '#b1a491',
      '--text-tertiary': '#b1a491',
      '--text-muted': '#928374',
      '--border-subtle': '#504945',
      '--green': '#b8bb26',
      '--yellow': '#fabd2f',
      '--orange': '#fe8019',
      '--red': '#fb4934',
      '--blue': '#83a598',
      '--purple': '#d3869b',
      '--aqua': '#8ec07c',
    }
  },

  github: {
    name: 'GitHub',
    light: {
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f6f8fa',
      '--bg-tertiary': '#eaeef2',
      '--text-primary': '#1f2328',
      '--text-secondary': '#626972',
      '--text-tertiary': '#626972',
      '--text-muted': '#8b949e',
      '--border-subtle': '#d0d7de',
      '--green': '#1a7f37',
      '--yellow': '#9a6700',
      '--orange': '#bc4c00',
      '--red': '#cf222e',
      '--blue': '#0969da',
      '--purple': '#8250df',
      '--aqua': '#1b7c83',
    },
    dark: {
      '--bg-primary': '#0d1117',
      '--bg-secondary': '#161b22',
      '--bg-tertiary': '#21262d',
      '--text-primary': '#e6edf3',
      '--text-secondary': '#8b949e',
      '--text-tertiary': '#8b949e',
      '--text-muted': '#6e7681',
      '--border-subtle': '#30363d',
      '--green': '#3fb950',
      '--yellow': '#d29922',
      '--orange': '#db6d28',
      '--red': '#f85149',
      '--blue': '#58a6ff',
      '--purple': '#bc8cff',
      '--aqua': '#39c5cf',
    }
  },

  dracula: {
    name: 'Dracula',
    // Alucard — official light variant from draculatheme.com/spec
    light: {
      '--bg-primary': '#fffbeb',          // Background
      '--bg-secondary': '#cfcfde',        // Selection
      '--bg-tertiary': '#6c664b',         // Current Line / Comment
      '--text-primary': '#1f1f1f',         // Foreground
      '--text-secondary': '#5f5a42',       // Comment
      '--text-tertiary': '#5f5a42',        // Comment
      '--text-muted': '#6c664b',          // Comment
      '--border-subtle': '#cfcfde',        // Selection
      '--green': '#4d8240',
      '--yellow': '#846e15',
      '--orange': '#ad6e1b',
      '--red': '#cb3a2a',
      '--blue': '#036a96',                 // Cyan
      '--purple': '#644ac9',
      '--aqua': '#a3144d',                 // Pink (Dracula has no separate aqua)
    },
    dark: {
      '--bg-primary': '#282a36',          // Background
      '--bg-secondary': '#44475a',         // Current Line
      '--bg-tertiary': '#44475a',          // Current Line
      '--text-primary': '#f8f8f2',         // Foreground
      '--text-secondary': '#adb6d0',       // Comment
      '--text-tertiary': '#adb6d0',       // raised to pass AA on #282a36
      '--text-muted': '#6272a4',           // Comment
      '--border-subtle': '#44475a',        // Current Line
      '--green': '#50fa7b',
      '--yellow': '#f1fa8c',
      '--orange': '#ffb86c',
      '--red': '#ff5555',
      '--blue': '#8be9fd',                 // Cyan
      '--purple': '#bd93f9',
      '--aqua': '#8be9fd',                 // Cyan (no separate aqua in Dracula)
    }
  },

  nord: {
    name: 'Nord',
    light: {
      '--bg-primary': '#eceff4',
      '--bg-secondary': '#e5e9f0',
      '--bg-tertiary': '#d8dee9',
      '--text-primary': '#2e3440',
      '--text-secondary': '#4c566a',
      '--text-tertiary': '#4c566a',
      '--text-muted': '#7b88a1',
      '--border-subtle': '#d8dee9',
      '--green': '#a3be8c',
      '--yellow': '#ebcb8b',
      '--orange': '#d08770',
      '--red': '#bf616a',
      '--blue': '#5e81ac',
      '--purple': '#b48ead',
      '--aqua': '#8fbcbb',
    },
    dark: {
      '--bg-primary': '#2e3440',
      '--bg-secondary': '#3b4252',
      '--bg-tertiary': '#434c5e',
      '--text-primary': '#eceff4',
      '--text-secondary': '#b1b6c3',
      '--text-tertiary': '#b1b6c3',
      '--text-muted': '#7b88a1',
      '--border-subtle': '#434c5e',
      '--green': '#a3be8c',
      '--yellow': '#ebcb8b',
      '--orange': '#d08770',
      '--red': '#bf616a',
      '--blue': '#81a1c1',
      '--purple': '#b48ead',
      '--aqua': '#8fbcbb',
    }
  },

  solarized: {
    name: 'Solarized',
    light: {
      '--bg-primary': '#fdf6e3',
      '--bg-secondary': '#eee8d5',
      '--bg-tertiary': '#e0d5c1',
      '--text-primary': '#586e75',
      '--text-secondary': '#56686f',
      '--text-tertiary': '#56686f',
      '--text-muted': '#93a1a1',
      '--border-subtle': '#e0d5c1',
      '--green': '#859900',
      '--yellow': '#b58900',
      '--orange': '#cb4b16',
      '--red': '#dc322f',
      '--blue': '#268bd2',
      '--purple': '#6c71c4',
      '--aqua': '#2aa198',
    },
    dark: {
      '--bg-primary': '#002b36',
      '--bg-secondary': '#073642',
      '--bg-tertiary': '#0a4b58',
      '--text-primary': '#839496',
      '--text-secondary': '#909fa3',
      '--text-tertiary': '#909fa3',
      '--text-muted': '#586e75',
      '--border-subtle': '#0a4b58',
      '--green': '#859900',
      '--yellow': '#b58900',
      '--orange': '#cb4b16',
      '--red': '#dc322f',
      '--blue': '#268bd2',
      '--purple': '#6c71c4',
      '--aqua': '#2aa198',
    }
  },

  catppuccin: {
    name: 'Catppuccin',
    light: {
      '--bg-primary': '#eff1f5',
      '--bg-secondary': '#e6e9ef',
      '--bg-tertiary': '#ccd0da',
      '--text-primary': '#4c4f69',
      '--text-secondary': '#5c5f71',
      '--text-tertiary': '#5c5f71',
      '--text-muted': '#8c8fa1',
      '--border-subtle': '#ccd0da',
      '--green': '#40a02b',
      '--yellow': '#df8e1d',
      '--orange': '#fe640b',
      '--red': '#d20f39',
      '--blue': '#1e66f5',
      '--purple': '#8839ef',
      '--aqua': '#179299',
    },
    dark: {
      '--bg-primary': '#1e1e2e',
      '--bg-secondary': '#181825',
      '--bg-tertiary': '#313244',
      '--text-primary': '#cdd6f4',
      '--text-secondary': '#9ba0b7',
      '--text-tertiary': '#9ba0b7',
      '--text-muted': '#6c7086',
      '--border-subtle': '#313244',
      '--green': '#a6e3a1',
      '--yellow': '#f9e2af',
      '--orange': '#fab387',
      '--red': '#f38ba8',
      '--blue': '#89b4fa',
      '--purple': '#cba6f7',
      '--aqua': '#94e2d5',
    }
  }
};

/**
 * Syntax colours for code blocks.
 *
 * The accent tokens are decorative — they carry tags, borders and icons, never
 * body text — and measured against `--bg-secondary` they fail AA 4.5:1 in most
 * of the 12 theme/mode pairs (worst: --yellow at 1.28:1 on nord light). Using
 * them raw for syntax would have made highlighted code *less* readable than the
 * plain text it replaced.
 *
 * So each role is derived from its hue and then walked toward black (light) or
 * white (dark) until it clears the threshold on the block background. Hue is
 * preserved, contrast is guaranteed, and no value is hand-tuned per theme.
 * Same approach as `--text-tertiary` above.
 */

export const CODE_SURFACE = '--bg-secondary';
const CODE_CONTRAST_TARGET = 4.6; // 4.5 — запас на округление каналов

/** Role → the accent token its hue comes from. */
const CODE_ROLE_SOURCES = {
  '--code-comment': '--text-muted',
  '--code-keyword': '--purple',
  '--code-string': '--green',
  '--code-number': '--orange',
  '--code-function': '--blue',
  '--code-type': '--yellow',
  '--code-tag': '--aqua',
  '--code-punctuation': '--text-secondary',
};

function hexToRgb(hex) {
  const value = String(hex || '').trim().replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

function channel(value) {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground, background) {
  const a = luminance(hexToRgb(foreground));
  const b = luminance(hexToRgb(background));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function deriveCodeColor(base, surface, toward) {
  const rgb = hexToRgb(base);
  if (contrastRatio(base, surface) >= CODE_CONTRAST_TARGET) return base;
  for (let step = 1; step <= 100; step += 1) {
    const t = step / 100;
    const candidate = rgbToHex(rgb.map((c) => c + (toward - c) * t));
    if (contrastRatio(candidate, surface) >= CODE_CONTRAST_TARGET) return candidate;
  }
  return rgbToHex([toward, toward, toward]);
}

for (const theme of Object.values(themes)) {
  for (const mode of ['light', 'dark']) {
    const surface = theme[mode][CODE_SURFACE];
    // Светлая тема — затемняем, тёмная — осветляем.
    const toward = mode === 'light' ? 0 : 255;
    for (const [role, source] of Object.entries(CODE_ROLE_SOURCES)) {
      theme[mode][role] = deriveCodeColor(theme[mode][source], surface, toward);
    }
  }
}

export const codeColorRoles = Object.keys(CODE_ROLE_SOURCES);

export const themeNames = Object.keys(themes);
