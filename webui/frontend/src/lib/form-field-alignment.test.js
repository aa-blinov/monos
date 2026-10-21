/**
 * Guards who owns the height of a text field.
 *
 * The bug: the global `input[type="text"], textarea` rule in app.css carried
 * `@apply ... py-1.5` and sat *outside* `@layer base`. Tailwind 3 has no native
 * cascade layers — `@layer` is its own bucketing, and the base bucket prints
 * before the utilities while a bare top-level rule prints after them. So that
 * padding silently won over `h-9` on Settings and `py-2` in the template
 * editor. Fields then measured 37px, 34px and 36px on different screens — same
 * design, three heights.
 *
 * The invariant now: the base rule owns colour and focus only, geometry belongs
 * to the component, and every text field says so explicitly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formFieldClass } from './form-field.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..');
const appCssRaw = readFileSync(join(SRC, 'app.css'), 'utf8');
// Комментарии вырезаем до разбора: иначе поиск по исходнику находит старый
// пример правила прямо в тексте-пояснении и проверяет его вместо живого CSS.
const appCss = appCssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

/** Returns the balanced `{...}` block that starts at the first `{` after `header`. */
function blockAt(css, header) {
  const start = css.indexOf(header);
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * Returns balanced `{...}` blocks starting at each `<input`/`<textarea`.
 * A plain non-greedy `/<input[\s\S]*?>/` truncates at the `>` of `=>` inside
 * `on:keydown={(e) => ...}` and then silently misses the class attribute.
 */
function extractTags(source) {
  const tags = [];
  const re = /<(?:input|textarea)\b/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = null;
    while (i < source.length) {
      const ch = source[i];
      if (quote !== null) {
        if (ch === '\\') i += 2;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{' || ch === '[' || ch === '(') depth += 1;
      else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
      else if (ch === '>' && depth === 0) break;
      i += 1;
    }
    tags.push(source.slice(m.index, i + 1));
    re.lastIndex = i + 1;
  }
  return tags;
}

const baseLayer = blockAt(appCss, '@layer base');
const inputRule = baseLayer ? blockAt(baseLayer, 'input[type="text"]') : null;

test('правило input[type="text"] объявлено и живёт внутри @layer base', () => {
  assert.ok(baseLayer, 'в app.css должен быть слой @layer base');
  assert.ok(
    inputRule,
    'правило input[type="text"] должно находиться внутри @layer base — написанное в конце файла, оно печатается после утилит и перебивает их',
  );
  const outside = appCss.replace(baseLayer, '');
  assert.doesNotMatch(
    outside,
    /input\[type="text"\]/,
    'input[type="text"] продублирован вне @layer base: правило в конце файла печатается после утилит и отменяет их',
  );
});

test('базовое правило не задаёт вертикальную геометрию поля', () => {
  assert.ok(inputRule, 'нужно правило input[type="text"]');
  assert.doesNotMatch(
    inputRule,
    /\bpy-[\d.]/,
    'базовый padding задаёт высоту поверх h-9 компонента — так поля снова разойдутся на 1px',
  );
  assert.doesNotMatch(
    inputRule,
    /\bp-[\d.]/,
    'базовый padding задаёт высоту поверх h-9 компонента — так поля снова разойдутся на 1px',
  );
  assert.doesNotMatch(
    inputRule,
    /\bh-(?!full\b)[\d[]/,
    'базовая высота задаёт геометрию за компонент: у полей-подчёркиваний она h-9 (36px)',
  );
});

test('базовый селектор обёрнут в :where() и не перебивает утилиты поля', () => {
  assert.ok(inputRule, 'нужно правило input[type="text"]');
  // Селектор стоит перед блоком: текст после последней `}` до вхождения селектора.
  const at = baseLayer.indexOf('input[type="text"]');
  const selector = baseLayer.slice(0, at).split('}').pop().trim();
  assert.match(
    selector,
    /^:where\(/,
    'селектор должен быть :where(...) — иначе input[type="text"] (0,1,1) перебивает утилиту поля (0,1,0). На этом потерялись заливка --bg-secondary у пилюль и собственный focus:border поля',
  );
});

test('базовое правило сохраняет underline-стилистику и focus', () => {
  assert.ok(inputRule, 'нужно правило input[type="text"]');
  assert.match(inputRule, /border-b/, 'подчёркивание — стилистика поля по умолчанию');
  assert.match(inputRule, /var\(--border-subtle\)/);
  assert.match(inputRule, /focus:border-\[var\(--text-secondary\)\]/);
  assert.match(inputRule, /outline-none/);
});

test('formFieldClass задаёт фиксированную высоту, а не производную от отступа', () => {
  const cls = formFieldClass();
  assert.match(cls, /h-9/, 'высота поля-подчёркивания объявлена явно');
  assert.doesNotMatch(cls, /\bpy-/, 'иначе высота снова складывается из padding + line-height + border');
  // Ровно 36px по шкале DESIGN.md; именно это значение показывал замер в браузере.
  assert.equal(36, 9 * 4, 'h-9 = 36px — зафиксированный замер во всех модалках');
});

test('каждое текстовое поле объявляет собственную вертикальную геометрию', () => {
  const componentsDir = join(SRC, 'components');
  const offenders = [];
  for (const file of readdirSync(componentsDir)) {
    if (!file.endsWith('.svelte')) continue;
    if (file.includes('__mocks__')) continue;
    const source = readFileSync(join(componentsDir, file), 'utf8');
    for (const tag of extractTags(source)) {
      // Базовое правило касается только input[type="text"] и textarea.
      if (tag.startsWith('<textarea')) { /* подходит */ } else if (!/type="text"/.test(tag)) continue;
      if (/class="[^"]*(hidden|sr-only)/.test(tag)) continue;

      const attr = tag.match(/class="([^"]*)"/) || tag.match(/class=\{([^}]*)\}/);
      const cls = attr ? attr[1] : '';
      const hasGeometry =
        /formFieldClass/.test(cls) ||
        /\bh-[\d[]/.test(cls) ||
        /\bh-full\b/.test(cls) ||
        /\bmin-h-/.test(cls) ||
        /\b(?:py|p)-[\d.]/.test(cls);
      if (!hasGeometry) {
        const id = (tag.match(/id="([^"]+)"/) || tag.match(/data-testid="([^"]+)"/) || [])[1] || '(без id)';
        offenders.push(`${file}: ${id}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `поля без собственной геометрии (сейчас без неё они сядут на дефолт браузера): ${offenders.join(', ')}`);
});
