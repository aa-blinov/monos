/**
 * Guards for four fixes: print highlighting, `![[embed]]` normalisation,
 * ambiguous wiki links, and the unused-attachments list.
 *
 * Each of these had a silent failure mode that a green build did not catch:
 * print printed code with its keywords missing, `[[note]]` was read as plain
 * text, and `resolve-link` answered with one of several notes without saying so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeObsidianEmbeds, markdownToEditorContent } from './markdown-editor-content.js';
import { formatAttachmentSize, fetchOrphanAttachments } from './attachments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..');
const BACKEND = join(SRC, '..', '..', 'backend');
const read = (...parts) => readFileSync(join(...parts), 'utf8');

// --- 1. Печать раскрашивает код ---------------------------------------------

const printSource = read(BACKEND, 'routes', 'print.js');

test('печать прогоняет код через lowlight', () => {
  assert.match(printSource, /import \{ common, createLowlight \} from 'lowlight'/);
  assert.match(printSource, /createLowlight\(common\)/);
  assert.match(printSource, /renderMarkdownToHtml[\s\S]*?highlightCodeBlocks\(html\)/);
});

test('обход hast-дерева не теряет текст и классы', () => {
  // Две разные формы узлов: текст лежит в `value`, классы — в
  // `properties.className`. Чтение только одной печатало блок то бесцветным,
  // то вовсе без слов.
  assert.match(printSource, /node\.properties\?\.className/);
  assert.match(printSource, /typeof node\.value === 'string'/);
  assert.match(printSource, /highlightTree\(node\.children \|\| \[\]\)/);
});

test('в стилях печати есть правила подсветки', () => {
  assert.match(printSource, /\.hljs-keyword/);
  assert.match(printSource, /\.hljs-string/);
  assert.match(printSource, /\.hljs-comment/);
});

test('цвета печати проходят AA 4.5:1 на её фоне блока', () => {
  // Фон блока в печати — #ebdbb2. Те же значения выведены редактором для
  // gruvbox light, чей --bg-secondary совпадает с этим цветом.
  const block = printSource.slice(printSource.indexOf('.hljs-comment'));
  // Только тела правил .hljs-*: если взять весь хвост таблицы стилей, туда
  // попадут цвета метаданных и ссылок, которые к подсветке отношения не имеют.
  const rules = [...block.matchAll(/\.hljs[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(rules.length >= 6, `ожидалось несколько правил подсветки, найдено ${rules.length}`);
  const colors = [...new Set(rules.join('\n').match(/#[0-9a-f]{6}/gi) || [])];

  const hex = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  // lum принимает УЖЕ разобранный массив каналов: когда сюда подавали hex(...)
  // вместо массива, расчёт уходил в NaN, а `NaN < 4.5` — ложь, то есть проверка
  // проходила при любых цветах вообще.
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const surface = lum(hex('#ebdbb2'));
  const ratio = (color) => {
    const l = lum(hex(color));
    const [hi, lo] = l > surface ? [l, surface] : [surface, l];
    return (hi + 0.05) / (lo + 0.05);
  };

  const bad = colors.filter((c) => {
    const value = ratio(c);
    return !Number.isFinite(value) || value < 4.5;
  });
  assert.deepEqual(bad, [], `нечитаемые цвета печати: ${bad.join(', ')}`);
});

// --- 2. Вставки ![[…]] ------------------------------------------------------

test('вставка картинки превращается в узел изображения', () => {
  const nodes = normalizeObsidianEmbeds('![[diagram.png]]');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'image');
  assert.equal(nodes[0].attrs.src, '_attachments/diagram.png');
  assert.equal(nodes[0].attrs.alt, 'diagram');
});

test('несколько вставок в одном абзаце разбираются все', () => {
  // Такое есть в корпусе: три картинки подряд в одной строке.
  const nodes = normalizeObsidianEmbeds('![[a.png]]![[b.png]]![[c.png]]');
  assert.equal(nodes.filter((n) => n.type === 'image').length, 3);
});

test('текст между вставками не пропадает', () => {
  // Узкое место разбиения: если не отдавать текст между совпадениями, он
  // исчезает из заметки молча — картинки на месте, слова потеряны.
  const nodes = normalizeObsidianEmbeds('![[a.png]] и ещё ![[b.png]] в конце');
  assert.deepEqual(nodes.map((n) => n.type), ['image', 'text', 'image', 'text']);
  assert.equal(nodes[1].text, ' и ещё ');
  assert.equal(nodes[3].text, ' в конце');
});

test('вставка внутри предложения сохраняет окружающий текст', () => {
  const nodes = normalizeObsidianEmbeds('Смотри ![[diagram.png]] тут');
  assert.deepEqual(nodes.map((n) => n.type), ['text', 'image', 'text']);
  assert.equal(nodes[0].text, 'Смотри ');
  assert.equal(nodes[2].text, ' тут');
});

test('имя файла с пробелами не разваливается', () => {
  const nodes = normalizeObsidianEmbeds('![[Pasted image 20260116142058.png]]');
  assert.equal(nodes[0].attrs.src, '_attachments/Pasted image 20260116142058.png');
  assert.equal(nodes[0].attrs.alt, 'Pasted image 20260116142058');
});

test('вложенный путь сохраняется', () => {
  assert.equal(normalizeObsidianEmbeds('![[sub/pic.png]]')[0].attrs.src, '_attachments/sub/pic.png');
});

test('wiki-ссылка на заметку не превращается в картинку', () => {
  // Без расширения — это вставка заметки, а не изображение. Ошибка здесь
  // выглядела бы как пустая рамка вместо содержимого.
  const nodes = normalizeObsidianEmbeds('![[Заметка]]');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'noteEmbed');
  assert.equal(nodes[0].attrs.name, 'Заметка');
  assert.equal(normalizeObsidianEmbeds('обычный текст'), null);
});

test('картинка и вставка заметки разбираются в одном проходе', () => {
  // Раньше находилась только первая форма, и вторая оставалась литералом.
  const nodes = normalizeObsidianEmbeds('![[a.png]] и ![[Заметка]]');
  assert.deepEqual(nodes.map((n) => n.type), ['image', 'text', 'noteEmbed']);
});

test('вставка доходит до документа целиком', () => {
  const doc = markdownToEditorContent('![[image-2.png]]');
  assert.equal(doc.content[0].content[0].type, 'image');
  assert.equal(doc.content[0].content[0].attrs.src, '_attachments/image-2.png');
});

// --- 3. Неоднозначные ссылки -------------------------------------------------

const notesSource = read(BACKEND, 'routes', 'notes.js');

test('resolve-link больше не берёт первую попавшуюся заметку', () => {
  const at = notesSource.indexOf("/api/notes/resolve-link");
  const block = notesSource.slice(at, notesSource.indexOf('app.get', at + 20));
  // Комментарии вырезаем: в объяснении к этой правке тоже написано «LIMIT 1»,
  // и без вырезания проверка цепляла собственное пояснение.
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(
    code,
    /LIMIT 1\b/,
    'LIMIT 1 — это и есть «молча выбрать одну из нескольких»',
  );
  assert.match(code, /ambiguous: true/);
  assert.match(code, /matches:/);
});

test('подсказки помечают задублированные имена', () => {
  assert.match(notesSource, /GROUP BY name HAVING COUNT\(\*\) > 1/);
  assert.match(notesSource, /duplicate: duplicates\.has/);
});

test('пикер показывает пометку дубля', () => {
  const editor = read(SRC, 'components', 'RichEditor.svelte');
  assert.match(editor, /#if suggestion\.duplicate/);
  assert.match(editor, /duplicateNameShort/);
});

// --- 4. Неиспользуемые вложения ---------------------------------------------

const attachmentsSource = read(BACKEND, 'routes', 'attachments.js');

test('есть эндпоинт неиспользуемых вложений', () => {
  assert.match(attachmentsSource, /app\.get\('\/api\/attachments\/orphans'/);
  assert.match(read(BACKEND, 'index.js'), /registerOrphanRoutes\(app\)/);
});

test('эндпоинт считает вложение использованным по ссылке из заметки', () => {
  // Референсы собираются из markdown самих заметок: иначе в отчёт попадали бы
  // все файлы подряд.
  assert.ok(
    /resolveReferencedPaths[\s\S]*matchAll\(\/\\\]/.test(attachmentsSource),
    'ссылки собираются из текста заметки — по одному пути на файл',
  );
  assert.match(attachmentsSource, /referenced\.has/);
});

test('вложения вынесены из настроек на свою страницу: в настройках только ссылка', () => {
  const settings = read(SRC, 'components', 'Settings.svelte');
  assert.doesNotMatch(settings, /data-testid="orphan-attachments"/);
  assert.match(settings, /data-testid="settings-open-attachments"/);
  const view = read(SRC, 'components', 'AttachmentsView.svelte');
  assert.match(view, /formatAttachmentSize\(item\.size, \$locale\)/);
  assert.match(view, /item\.usedBy/);
});

test('форматтер размера не врёт на границах', () => {
  assert.equal(formatAttachmentSize(0), '0 B');
  assert.equal(formatAttachmentSize(999), '999 B');
  assert.equal(formatAttachmentSize(1024), '1 KB');
  assert.equal(formatAttachmentSize(1536), '1.5 KB');
  assert.equal(formatAttachmentSize(5 * 1024 * 1024), '5 MB');
  assert.equal(formatAttachmentSize(NaN), '—');
});

test('загрузка списка идёт на /api/attachments/orphans', () => {
  assert.match(read(SRC, 'lib', 'attachments.js'), /\/api\/attachments\/orphans/);
  assert.match(read(SRC, 'lib', 'attachments.js'), /export async function fetchOrphanAttachments/);
});
