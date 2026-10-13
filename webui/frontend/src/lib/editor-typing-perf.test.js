/**
 * The editor used to build the whole note's markdown on every keystroke.
 *
 * Measured: ~4.2 ms per character on a 18k-character note, and the cost grew
 * with note size. The markdown is now assembled once after a short pause, so
 * every place that reads the note *outside* the editor must flush it first —
 * otherwise the last keystrokes live in the editor but never reach the file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..');
const rich = readFileSync(join(SRC, 'components', 'RichEditor.svelte'), 'utf8');
const editor = readFileSync(join(SRC, 'components', 'Editor.svelte'), 'utf8');

test('разметка собирается не на каждое нажатие, а после паузы', () => {
  assert.match(rich, /MARKDOWN_FLUSH_DELAY/);
  assert.match(rich, /setTimeout\([\s\S]{0,120}flushMarkdown\(\)/);
  assert.doesNotMatch(
    rich,
    /onUpdate: \(\{ editor: ed \}\) => \{\s*if \(!editable\) return;\s*onUpdate\(editorMarkdown\(ed\)\)/,
    'сериализация вернулась в обработчик обновления — ввод снова станет зависить от размера заметки',
  );
});

test('flushMarkdown отдаёт накопленное досрочно и сбрасывает таймер', () => {
  assert.match(rich, /export function flushMarkdown\(\)/);
  assert.match(rich, /function flushMarkdown\(\)[\s\S]{0,200}clearTimeout\(markdownTimer\)/);
  assert.match(rich, /pendingMarkdown = null/);
});

test('редактор сбрасывает разметку перед сохранением', () => {
  const save = editor.slice(editor.indexOf('async function saveContent'));
  assert.match(save.slice(0, 400), /flushEditorMarkdown\(\)/,
    'без сброса Ctrl+S в первые 250 мс после нажатия записал бы старый текст');
});

test('редактор сбрасывает разметку перед уходом из заметки', () => {
  const sw = editor.slice(editor.indexOf('async function savePendingLoadedFile'));
  assert.match(sw.slice(0, 400), /flushEditorMarkdown\(\)/);
});

test('редактор сбрасывает разметку при выгрузке', () => {
  const od = editor.slice(editor.indexOf('onDestroy('));
  assert.match(od.slice(0, 200), /flushEditorMarkdown\(\)/);
});

test('переключение в сырой режим показывает свежий текст', () => {
  assert.match(editor, /on:click=\{\(\) => \{ flushEditorMarkdown\(\); rawMode = !rawMode; \}\}/);
});

test('окно до автосохранения не удлинилось', () => {
  // Пауза на сбор разметки складывается с задержкой автосохранения: если не
  // вычесть её, правка перестаёт попадать в файл на 250 мс позже прежнего.
  const delay = /const AUTOSAVE_DELAY = (\d+);/.exec(editor);
  assert.ok(delay, 'не найдена задержка автосохранения');
  const pause = /const MARKDOWN_FLUSH_DELAY = (\d+);/.exec(rich);
  assert.ok(pause, 'не найдена задержка сборки разметки');
  assert.equal(
    Number(delay[1]) + Number(pause[1]),
    1500,
    `окно от последнего нажатия до записи выросло до ${Number(delay[1]) + Number(pause[1])} мс вместо прежних 1500`,
  );
});

test('собственная разметка не применяется обратно в документ', () => {
  // Раньше на каждое нажатие документ пересобирался из markdown, который мы
  // же только что отдали. Это лишняя полная пересборка на каждое нажатие.
  assert.match(rich, /lastEmittedMarkdown/);
  assert.match(rich, /if \(nextContent !== lastEmittedMarkdown\)/);
});
