import test from 'node:test';
// `--text-secondary` is deliberately NOT the upstream palette value in every
// theme. It is the body-text step (14px note excerpts, field labels), so it is
// governed by the WCAG AA guarantee asserted below rather than by brand
// fidelity: measured against `--bg-secondary` and against a note card carrying
// the 13% `--note-tint`, the upstream values fall to 1.94:1 in dracula.dark.
// Each value below is the minimum shift from the upstream colour that clears
// 4.5:1 on every surface where the token is actually used. Backgrounds,
// foreground and accents stay exactly as the upstream palettes define them.
import assert from 'node:assert/strict';
import { themes, contrastRatio } from './themes.js';
import fs from 'node:fs';

// Gruvbox — каноническая палитра (morhetz/gruvbox)
test('gruvbox.dark совпадает с medium-контрастной палитрой morhetz/gruvbox', () => {
  const { dark } = themes.gruvbox;
  assert.equal(dark['--bg-primary'], '#282828');     // bg0
  assert.equal(dark['--bg-secondary'], '#3c3836');   // bg1
  assert.equal(dark['--bg-tertiary'], '#504945');    // bg2
  assert.equal(dark['--text-primary'], '#ebdbb2');   // fg1
  assert.equal(dark['--text-secondary'], '#b1a491'); // fg4
  assert.equal(dark['--text-muted'], '#928374');     // gray
  assert.equal(dark['--red'], '#fb4934');            // red_bright
  assert.equal(dark['--green'], '#b8bb26');          // green_bright
  assert.equal(dark['--yellow'], '#fabd2f');         // yellow_bright
  assert.equal(dark['--blue'], '#83a598');          // blue_bright
  assert.equal(dark['--purple'], '#d3869b');         // purple_bright
  assert.equal(dark['--aqua'], '#8ec07c');           // aqua_bright
  assert.equal(dark['--orange'], '#fe8019');         // orange_bright
});

test('gruvbox.light совпадает с medium-контрастной палитрой', () => {
  const { light } = themes.gruvbox;
  assert.equal(light['--bg-primary'], '#fbf1c7');    // bg0
  assert.equal(light['--bg-secondary'], '#ebdbb2');  // bg1
  assert.equal(light['--bg-tertiary'], '#d5c4a1');   // bg2
  assert.equal(light['--text-primary'], '#3c3836');  // fg1
  assert.equal(light['--red'], '#cc241d');           // red_neutral
  assert.equal(light['--green'], '#98971a');         // green_neutral
  assert.equal(light['--yellow'], '#d79921');        // yellow_neutral
  assert.equal(light['--blue'], '#458588');         // blue_neutral
  assert.equal(light['--purple'], '#b16286');        // purple_neutral
  assert.equal(light['--aqua'], '#689d6a');          // aqua_neutral
  assert.equal(light['--orange'], '#d65d0e');        // orange_neutral
});

// GitHub Primer (primer.style)
test('github.dark совпадает с Primer', () => {
  const { dark } = themes.github;
  assert.equal(dark['--bg-primary'], '#0d1117');
  assert.equal(dark['--bg-secondary'], '#161b22');
  assert.equal(dark['--bg-tertiary'], '#21262d');
  assert.equal(dark['--text-primary'], '#e6edf3');
  assert.equal(dark['--text-secondary'], '#8b949e');
  assert.equal(dark['--text-muted'], '#6e7681');
  assert.equal(dark['--border-subtle'], '#30363d');
  assert.equal(dark['--green'], '#3fb950');
  assert.equal(dark['--yellow'], '#d29922');
  assert.equal(dark['--orange'], '#db6d28');
  assert.equal(dark['--red'], '#f85149');
  assert.equal(dark['--blue'], '#58a6ff');
  assert.equal(dark['--purple'], '#bc8cff');
  assert.equal(dark['--aqua'], '#39c5cf');
});

test('github.light совпадает с Primer (включая data-cyan-emphasis)', () => {
  const { light } = themes.github;
  assert.equal(light['--bg-primary'], '#ffffff');
  assert.equal(light['--bg-secondary'], '#f6f8fa');
  assert.equal(light['--bg-tertiary'], '#eaeef2');
  assert.equal(light['--text-primary'], '#1f2328');
  assert.equal(light['--text-secondary'], '#626972');
  assert.equal(light['--text-muted'], '#8b949e');
  assert.equal(light['--border-subtle'], '#d0d7de');
  assert.equal(light['--green'], '#1a7f37');
  assert.equal(light['--yellow'], '#9a6700');
  assert.equal(light['--orange'], '#bc4c00');
  assert.equal(light['--red'], '#cf222e');
  assert.equal(light['--blue'], '#0969da');
  assert.equal(light['--purple'], '#8250df');
  assert.equal(light['--aqua'], '#1b7c83');          // Primer data-cyan-emphasis
});

// Dracula (draculatheme.com/spec)
test('dracula.dark.bg/foreground совпадает с официальной палитрой', () => {
  const { dark } = themes.dracula;
  assert.equal(dark['--bg-primary'], '#282a36');     // Background
  assert.equal(dark['--bg-secondary'], '#44475a');   // Selection / current-line
  assert.equal(dark['--bg-tertiary'], '#44475a');
  assert.equal(dark['--border-subtle'], '#44475a');
  assert.equal(dark['--text-primary'], '#f8f8f2');   // Foreground
  assert.equal(dark['--text-secondary'], '#adb6d0'); // Comment
  assert.equal(dark['--text-muted'], '#6272a4');
  assert.equal(dark['--red'], '#ff5555');
  assert.equal(dark['--green'], '#50fa7b');
  assert.equal(dark['--yellow'], '#f1fa8c');
  assert.equal(dark['--orange'], '#ffb86c');
  assert.equal(dark['--blue'], '#8be9fd');           // Cyan
  assert.equal(dark['--purple'], '#bd93f9');
  assert.equal(dark['--aqua'], '#8be9fd');           // Cyan
});

test('dracula.light (Alucard) совпадает с официальной палитрой', () => {
  const { light } = themes.dracula;
  assert.equal(light['--bg-primary'], '#fffbeb');     // Background
  assert.equal(light['--bg-secondary'], '#cfcfde');   // Selection
  assert.equal(light['--bg-tertiary'], '#6c664b');    // Current Line / Comment
  assert.equal(light['--border-subtle'], '#cfcfde');
  assert.equal(light['--text-primary'], '#1f1f1f');    // Foreground
  assert.equal(light['--text-secondary'], '#5f5a42');  // Comment
  assert.equal(light['--text-muted'], '#6c664b');
  assert.equal(light['--red'], '#cb3a2a');
  assert.equal(light['--green'], '#4d8240');
  assert.equal(light['--yellow'], '#846e15');
  assert.equal(light['--orange'], '#ad6e1b');
  assert.equal(light['--blue'], '#036a96');           // Cyan
  assert.equal(light['--purple'], '#644ac9');
  assert.equal(light['--aqua'], '#a3144d');           // Pink
});

// Nord (nordtheme.com)
test('nord.dark совпадает с официальной палитрой', () => {
  const { dark } = themes.nord;
  assert.equal(dark['--bg-primary'], '#2e3440');   // nord0
  assert.equal(dark['--bg-secondary'], '#3b4252'); // nord1
  assert.equal(dark['--bg-tertiary'], '#434c5e');  // nord2
  assert.equal(dark['--text-primary'], '#eceff4'); // nord6
  assert.equal(dark['--red'], '#bf616a');          // Aurora
  assert.equal(dark['--green'], '#a3be8c');
  assert.equal(dark['--yellow'], '#ebcb8b');
  assert.equal(dark['--orange'], '#d08770');
  assert.equal(dark['--blue'], '#81a1c1');          // Frost nord10
  assert.equal(dark['--purple'], '#b48ead');
  assert.equal(dark['--aqua'], '#8fbcbb');          // Frost nord7
});

test('nord.light совпадает с официальной палитрой', () => {
  const { light } = themes.nord;
  assert.equal(light['--bg-primary'], '#eceff4');  // nord6
  assert.equal(light['--bg-secondary'], '#e5e9f0'); // nord5
  assert.equal(light['--bg-tertiary'], '#d8dee9');  // nord4
  assert.equal(light['--text-primary'], '#2e3440'); // nord0
  assert.equal(light['--red'], '#bf616a');
  assert.equal(light['--green'], '#a3be8c');
  assert.equal(light['--yellow'], '#ebcb8b');
  assert.equal(light['--orange'], '#d08770');
  assert.equal(light['--blue'], '#5e81ac');         // Frost nord9
  assert.equal(light['--purple'], '#b48ead');
  assert.equal(light['--aqua'], '#8fbcbb');
});

// Solarized (ethanschoonover.com/solarized)
// Note: bg-tertiary / border-subtle интерполированы между base и base2,
//       в официальной палитре только 8 base-цветов — 3 уровня фона не
//       покрываются точно.
test('solarized.dark совпадает с официальной палитрой (где возможно)', () => {
  const { dark } = themes.solarized;
  assert.equal(dark['--bg-primary'], '#002b36');    // base03
  assert.equal(dark['--bg-secondary'], '#073642');  // base02
  assert.equal(dark['--text-primary'], '#839496');  // base0
  assert.equal(dark['--text-secondary'], '#909fa3'); // base01
  assert.equal(dark['--text-muted'], '#586e75');    // base01 (Solarized не определяет уровень ниже comment)
  assert.equal(dark['--green'], '#859900');
  assert.equal(dark['--yellow'], '#b58900');
  assert.equal(dark['--orange'], '#cb4b16');
  assert.equal(dark['--red'], '#dc322f');
  assert.equal(dark['--blue'], '#268bd2');
  assert.equal(dark['--purple'], '#6c71c4');        // violet
  assert.equal(dark['--aqua'], '#2aa198');          // cyan
});

test('solarized.light совпадает с официальной палитрой (где возможно)', () => {
  const { light } = themes.solarized;
  assert.equal(light['--bg-primary'], '#fdf6e3');   // base3
  assert.equal(light['--bg-secondary'], '#eee8d5'); // base2
  assert.equal(light['--text-primary'], '#586e75'); // base01
  assert.equal(light['--text-secondary'], '#56686f'); // base00
  assert.equal(light['--text-muted'], '#93a1a1');   // base1
  assert.equal(light['--green'], '#859900');
  assert.equal(light['--yellow'], '#b58900');
  assert.equal(light['--orange'], '#cb4b16');
  assert.equal(light['--red'], '#dc322f');
  assert.equal(light['--blue'], '#268bd2');
  assert.equal(light['--purple'], '#6c71c4');
  assert.equal(light['--aqua'], '#2aa198');
});

// Catppuccin Latte/Mocha
test('catppuccin.dark (Mocha) совпадает с официальной палитрой', () => {
  const { dark } = themes.catppuccin;
  assert.equal(dark['--bg-primary'], '#1e1e2e');    // Base
  assert.equal(dark['--bg-secondary'], '#181825');  // Mantle
  assert.equal(dark['--bg-tertiary'], '#313244');   // Surface0
  assert.equal(dark['--text-primary'], '#cdd6f4');   // Text
  assert.equal(dark['--text-secondary'], '#9ba0b7'); // Subtext1
  assert.equal(dark['--text-muted'], '#6c7086');    // Subtext0
  assert.equal(dark['--border-subtle'], '#313244');  // Surface0
  assert.equal(dark['--red'], '#f38ba8');
  assert.equal(dark['--green'], '#a6e3a1');
  assert.equal(dark['--yellow'], '#f9e2af');
  assert.equal(dark['--orange'], '#fab387');        // Peach
  assert.equal(dark['--blue'], '#89b4fa');
  assert.equal(dark['--purple'], '#cba6f7');       // Mauve
  assert.equal(dark['--aqua'], '#94e2d5');          // Teal
});

test('catppuccin.light (Latte) совпадает с официальной палитрой', () => {
  const { light } = themes.catppuccin;
  assert.equal(light['--bg-primary'], '#eff1f5');   // Base
  assert.equal(light['--bg-secondary'], '#e6e9ef'); // Mantle
  assert.equal(light['--bg-tertiary'], '#ccd0da');  // Surface0
  assert.equal(light['--text-primary'], '#4c4f69');  // Text
  assert.equal(light['--text-secondary'], '#5c5f71'); // Subtext1
  assert.equal(light['--text-muted'], '#8c8fa1');   // Subtext0
  assert.equal(light['--border-subtle'], '#ccd0da'); // Surface0
  assert.equal(light['--red'], '#d20f39');
  assert.equal(light['--green'], '#40a02b');
  assert.equal(light['--yellow'], '#df8e1d');
  assert.equal(light['--orange'], '#fe640b');       // Peach
  assert.equal(light['--blue'], '#1e66f5');
  assert.equal(light['--purple'], '#8839ef');        // Mauve
  assert.equal(light['--aqua'], '#179299');          // Teal
});

// Защита: все темы содержат одинаковый набор ключей
test('все темы содержат одинаковый набор CSS-переменных', () => {
  const REQUIRED_KEYS = [
    '--bg-primary', '--bg-secondary', '--bg-tertiary',
    '--text-primary', '--text-secondary', '--text-tertiary', '--text-muted',
    '--border-subtle',
    '--green', '--yellow', '--orange', '--red', '--blue',
    '--purple', '--aqua',
  ];
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      for (const key of REQUIRED_KEYS) {
        assert.ok(
          typeof theme[mode][key] === 'string' && theme[mode][key].startsWith('#'),
          `${name}.${mode} должен содержать ${key}, нет: ${theme[mode][key]}`
        );
      }
    }
  }
});

// Метаданные (9-10px) лежат не на чистой бумаге, а на карточке, поверх
// которой наложен 13% цвет заметки (--note-tint). Проверяем контраст именно
// там: раньше токен считался по --bg-primary и не дотягивал до AA.
const NOTE_TINT = 0.13;
const ACCENTS = ['--red', '--orange', '--yellow', '--green', '--aqua', '--blue', '--purple'];

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const channel = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (fg, bg) => {
  const L1 = luminance(hexToRgb(fg));
  const L2 = luminance(hexToRgb(bg));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
};
const tintOver = (accent, bg, alpha) => {
  const A = hexToRgb(accent);
  const B = hexToRgb(bg);
  return '#' + [0, 1, 2]
    .map((i) => Math.round(A[i] * alpha + B[i] * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('');
};

test('--text-tertiary проходит AA 4.5:1 на тонированной карточке', () => {
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      const vars = theme[mode];
      const bg = vars['--bg-primary'];
      const tertiary = vars['--text-tertiary'];
      for (const key of ACCENTS) {
        const tinted = tintOver(vars[key], bg, NOTE_TINT);
        const ratio = contrast(tertiary, tinted);
        assert.ok(
          ratio >= 4.5,
          `${name}.${mode}: --text-tertiary ${tertiary} даёт ${ratio.toFixed(2)}:1 на карточке с ${key} (нужно 4.5:1)`
        );
      }
    }
  }
});

test('--text-tertiary проходит AA на всех рабочих поверхностях', () => {
  const SURFACES = (vars) => [
    vars['--bg-primary'],
    vars['--bg-secondary'],
    ...ACCENTS.map((key) => tintOver(vars[key], vars['--bg-primary'], NOTE_TINT)),
  ];
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      for (const surface of SURFACES(theme[mode])) {
        const ratio = contrast(theme[mode]['--text-tertiary'], surface);
        assert.ok(
          ratio >= 4.5,
          `${name}.${mode}: --text-tertiary даёт ${ratio.toFixed(2)}:1 на ${surface} (нужно 4.5:1)`
        );
      }
    }
  }
});

test('--text-secondary проходит AA на всех рабочих поверхностях', () => {
  // Every surface where secondary text is actually used: the two paper
  // layers, plus a note card carrying each accent's 13% tint.
  const SURFACES = (vars) => [
    vars['--bg-primary'],
    vars['--bg-secondary'],
    ...ACCENTS.map((key) => tintOver(vars[key], vars['--bg-primary'], NOTE_TINT)),
  ];
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      for (const surface of SURFACES(theme[mode])) {
        const ratio = contrast(theme[mode]['--text-secondary'], surface);
        assert.ok(
          ratio >= 4.5,
          `${name}.${mode}: --text-secondary ${theme[mode]['--text-secondary']} даёт ${ratio.toFixed(2)}:1 на ${surface} (нужно 4.5:1)`
        );
      }
    }
  }
});

test('--text-tertiary не проваливается и на чистой бумаге', () => {
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      const ratio = contrast(theme[mode]['--text-tertiary'], theme[mode]['--bg-primary']);
      assert.ok(ratio >= 4.5, `${name}.${mode}: ${ratio.toFixed(2)}:1 на бумаге`);
    }
  }
});


const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const blend = (fg, bg, alpha) => '#' + hexRgb(fg).map((c, i) => Math.round(c * alpha + hexRgb(bg)[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');

test('кольцо фокуса: не слабее 3:1 на обоих фонах во всех 12 парах палитра и режим', () => {
  const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const match = css.match(/:focus-visible\s*\{\s*outline:\s*[\d.]+px solid color-mix\(in srgb, var\(--text-primary\) (\d+)%, transparent\)/);
  assert.ok(match, 'кольцо фокуса в app.css записано как color-mix от --text-primary');
  const alpha = Number(match[1]) / 100;
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      for (const bgKey of ['--bg-primary', '--bg-secondary']) {
        const bg = theme[mode][bgKey];
        const ring = blend(theme[mode]['--text-primary'], bg, alpha);
        assert.ok(contrastRatio(ring, bg) >= 3, `${name}.${mode} кольцо на ${bgKey}: ${contrastRatio(ring, bg).toFixed(2)}`);
      }
    }
  }
});

test('--text-tertiary читается (4.5:1) на обоих фонах во всех 12 парах; --text-muted не для текста', () => {
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      for (const bgKey of ['--bg-primary', '--bg-secondary']) {
        const ratio = contrastRatio(theme[mode]['--text-tertiary'], theme[mode][bgKey]);
        assert.ok(ratio >= 4.5, `${name}.${mode} tertiary на ${bgKey}: ${ratio.toFixed(2)}`);
      }
    }
  }
  const dir = new URL('../components/', import.meta.url);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.svelte'))) {
    const source = fs.readFileSync(new URL(file, dir), 'utf8');
    assert.ok(!/text-\[var\(--text-muted\)\]/.test(source), `${file}: --text-muted как цвет текста (не проходит 4.5:1 в 11 из 12 пар)`);
  }
});

// The palette that is drawn comes from the kit (themes.css); these tokens are what Monos reads on top of it.
const kitCss = fs.readFileSync(new URL('../../node_modules/@monos/ui/src/styles/themes.css', import.meta.url), 'utf8');
const appCss = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

function kitPalettes() {
  return [...kitCss.matchAll(/\[data-theme="(\w+)"\]\[data-mode="(\w+)"\]\s*\{([^}]*)\}/g)].map(([, name, mode, body]) => ({
    name,
    mode,
    vars: Object.fromEntries([...body.matchAll(/--ui-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((match) => [match[1], hexToRgb(match[2])])),
  }));
}
const rgbToHex = (rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
const mixRgb = (a, b, share) => a.map((value, index) => Math.round(value * share + b[index] * (1 - share)));

test('текст ошибки, предупреждения и «готово» читается (4.5:1) на бумаге, на втором слое и на плашке своего цвета во всех 12 парах', () => {
  const tokens = [['--red-text', 'danger-text', 'danger'], ['--yellow-text', 'warning-text', 'warning'], ['--green-text', 'success-text', 'success']];
  const palettes = kitPalettes();
  assert.equal(palettes.length, 12);
  for (const [token, textKey, toneKey] of tokens) {
    // The token as app.css writes it: a share of the kit's text colour, the rest black (light) or white (dark).
    const light = appCss.match(new RegExp(`${token}:\\s*color-mix\\(in srgb, var\\(--ui-${textKey}\\) (\\d+)%, black\\)`));
    const dark = appCss.match(new RegExp(`:root\\[data-mode="dark"\\]\\s*\\{[^}]*${token}:\\s*color-mix\\(in srgb, var\\(--ui-${textKey}\\) (\\d+)%, white\\)`));
    assert.ok(light && dark, `${token} записан в app.css для светлой и тёмной тем`);
    for (const { name, mode, vars } of palettes) {
      const share = Number((mode === 'dark' ? dark : light)[1]) / 100;
      const colour = mixRgb(vars[textKey], mode === 'dark' ? [255, 255, 255] : [0, 0, 0], share);
      const surfaces = [vars.bg, vars.surface, mixRgb(vars[toneKey], vars.bg, 0.08), mixRgb(vars[toneKey], vars.bg, 0.1)];
      for (const surface of surfaces) {
        const ratio = contrast(rgbToHex(colour), rgbToHex(surface));
        assert.ok(ratio >= 4.5, `${name}.${mode}: ${token} ${rgbToHex(colour)} даёт ${ratio.toFixed(2)}:1 на ${rgbToHex(surface)}`);
      }
    }
  }
});

test('цвета красный, жёлтый и зелёный не стоят в компонентах как цвет текста: для текста есть -text', () => {
  const dir = new URL('../components/', import.meta.url);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.svelte'))) {
    const source = fs.readFileSync(new URL(file, dir), 'utf8');
    assert.ok(!/text-\[var\(--(red|yellow|green)\)\]/.test(source), `${file}: text-[var(--red|yellow|green)] — для текста берут --…-text`);
  }
  assert.ok(!/opacity:\s*0\.72/.test(fs.readFileSync(new URL('../components/RichEditor.svelte', import.meta.url), 'utf8')), 'подпись под картинкой без прозрачности: она роняла контраст ниже 4.5:1');
});
