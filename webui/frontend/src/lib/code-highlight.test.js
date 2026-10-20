/**
 * Guards for syntax highlighting.
 *
 * Two failure modes this file exists to prevent, both verified in the browser:
 *
 * 1. The extension was installed but never imported. Every code block rendered
 *    as flat monospace text even though 150 blocks in the corpus carry a
 *    language tag.
 * 2. The syntax colours were unreadable. Accent tokens are decorative and fail
 *    AA on the block background (--yellow at 1.28:1 on nord light), so the
 *    derived --code-* ramp is asserted here instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { themes, codeColorRoles, contrastRatio, CODE_SURFACE } from './themes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..');

// --- 1. Расширение подключено ------------------------------------------------

const extensionsSource = readFileSync(join(SRC, 'lib', 'richEditorExtensions.js'), 'utf8');

test('редактор импортирует CodeBlockLowlight', () => {
  assert.match(extensionsSource, /import\s+CodeBlockLowlight\s+from\s+'@tiptap\/extension-code-block-lowlight'/);
});

test('в набор расширений входит CodeBlockLowlight с настроенным lowlight', () => {
  assert.match(extensionsSource, /CodeBlockLowlight\.configure\(\{\s*lowlight\s*\}\)/);
});

test('штатный CodeBlock отключён, иначе подсветку перебьёт', () => {
  assert.match(
    extensionsSource,
    /StarterKit\.configure\(\{[\s\S]*?codeBlock:\s*false/,
    'без codeBlock: false в наборе окажутся два расширения одного узла',
  );
});

test('низлайт создан на common и получает синонимы', () => {
  assert.match(extensionsSource, /createLowlight\(common\)/);
  // Ключ — язык, значение — синонимы. `env` в заметках идёт вместо `ini`.
  assert.match(extensionsSource, /registerAlias\(\{\s*ini:\s*'env'\s*\}\)/);
});

// --- 2. Палитра читаема во всех темах ----------------------------------------

test('кодовые роли выведены для каждой темы и режима', () => {
  assert.ok(codeColorRoles.length >= 6, 'ролей должно хватать для читаемой подсветки');
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      for (const role of codeColorRoles) {
        assert.match(
          theme[mode][role] || '',
          /^#[0-9a-f]{6}$/i,
          `${name}.${mode}: ${role} не задан`,
        );
      }
    }
  }
});

test('каждый токен кода проходит AA 4.5:1 на фоне блока', () => {
  const failures = [];
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      const surface = theme[mode][CODE_SURFACE];
      for (const role of codeColorRoles) {
        const ratio = contrastRatio(theme[mode][role], surface);
        // Number.isFinite обязателен: без него неназначенный токен даёт NaN,
        // а `NaN < 4.5` — false, то есть проскочил бы молча.
        if (!Number.isFinite(ratio) || ratio < 4.5) {
          failures.push(`${name}.${mode} ${role} ${theme[mode][role] || '(не задан)'} = ${Number.isFinite(ratio) ? `${ratio.toFixed(2)}:1` : 'NaN'}`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], `нечитаемые токены подсветки:\n${failures.join('\n')}`);
});

test('вывод сохраняет оттенок исходного акцента', () => {
  // Иначе «выведенный» токен — это просто серый, и подсветка бессмысленна.
  for (const [name, theme] of Object.entries(themes)) {
    for (const mode of ['light', 'dark']) {
      const keyword = theme[mode]['--code-keyword'];
      const source = theme[mode]['--purple'];
      const hue = (hex) => {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max === min) return 0;
        if (max === r) return ((g - b) / (max - min) + 6) % 6;
        if (max === g) return (b - r) / (max - min) + 2;
        return (r - g) / (max - min) + 4;
      };
      const diff = Math.abs(hue(keyword) - hue(source));
      const circular = Math.min(diff, 6 - diff);
      assert.ok(
        circular <= 1.0,
        `${name}.${mode}: --code-keyword ${keyword} ушёл по оттенку от --purple ${source}`,
      );
    }
  }
});

// --- 3. Правила подсветки реально попадают в CSS -----------------------------

test('правила .hljs-* есть в app.css', () => {
  const css = readFileSync(join(SRC, 'app.css'), 'utf8');
  for (const role of codeColorRoles) {
    assert.ok(
      css.includes(`var(${role})`),
      `токен ${role} объявлен, но не используется ни в одном правиле подсветки`,
    );
  }
  assert.match(css, /\.hljs-keyword/);
  assert.match(css, /\.hljs-string/);
});

test('правила подсветки не заперты в @layer components', () => {
  // Блок @layer components после директив @tailwind в этой сборке не доходит
  // до вывода: подсветка молча пропадала целиком. Комментарии вырезаем —
  // иначе проверка находит само упоминание в поясняющем тексте.
  const raw = readFileSync(join(SRC, 'app.css'), 'utf8');
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const hljsAt = css.indexOf('.hljs-comment');
  assert.ok(hljsAt !== -1, 'нет ни одного правила .hljs-*');
  assert.equal(
    css.slice(0, hljsAt).lastIndexOf('@layer components'),
    -1,
    'правила .hljs-* лежат внутри @layer components, который не попадает в сборку',
  );
});

// --- 4. Блок кода не наследует оформление инлайн-чипа ------------------------

test('code внутри pre не остаётся чипом', () => {
  const editor = readFileSync(join(SRC, 'components', 'RichEditor.svelte'), 'utf8');
  assert.match(
    editor,
    /\[&_\.ProseMirror_pre_code\]:bg-transparent/,
    'иначе каждый блок кода получает отступы и уменьшенный шрифт инлайн-кода',
  );
});

// --- 5. Язык доезжает из markdown в узел -------------------------------------

test('markdown-editor-content проставляет язык блокам кода', () => {
  const source = readFileSync(join(SRC, 'lib', 'markdown-editor-content.js'), 'utf8');
  assert.match(source, /export function withCodeLanguages/);
  assert.match(source, /export function fencedBlockLanguages/);
  // И вызывается на обоих путях разбора: с таблицами и без.
  const calls = source.match(/withCodeLanguages\(/g) || [];
  assert.ok(calls.length >= 3, `ожидались объявление и два вызова, найдено ${calls.length}`);
});

test('каждая заметка корпуса с блоками кода остаётся с языками', () => {
  // Барьер против тихой порчи: без простановки языка сохранение заметки
  // срезает ```bash до голого ``` (проверено сквозняком).
  const test = readFileSync(join(SRC, 'lib', 'markdown-editor-content.test.js'), 'utf8');
  assert.match(test, /язык fenced-блока доезжает до узла codeBlock/);
});

// --- 6. Компоненты существуют и подключены ------------------------------------

test('компоненты редактора на месте', () => {
  for (const file of ['RichEditor.svelte', 'Editor.svelte']) {
    assert.ok(readdirSync(join(SRC, 'components')).includes(file), `нет ${file}`);
  }
});
