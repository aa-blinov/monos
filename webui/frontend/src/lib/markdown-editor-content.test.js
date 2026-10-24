import test from 'node:test';
import assert from 'node:assert/strict';
import { plainTextDocument, markdownToEditorContent, fencedBlockLanguages } from './markdown-editor-content.js';

test('plainTextDocument возвращает TipTap-совместимую структуру', () => {
  const doc = plainTextDocument('hello world');
  assert.equal(doc.type, 'doc');
  assert.ok(Array.isArray(doc.content));
  assert.equal(doc.content.length, 1);
  const para = doc.content[0];
  assert.equal(para.type, 'paragraph');
  assert.equal(para.content[0].text, 'hello world');
});

test('plainTextDocument пустая строка → один пустой paragraph', () => {
  const doc = plainTextDocument('');
  assert.equal(doc.type, 'doc');
  assert.equal(doc.content.length, 1);
  assert.equal(doc.content[0].type, 'paragraph');
  // пустой paragraph: content = undefined (для совместимости с TipTap)
  assert.equal(doc.content[0].content, undefined);
});

test('plainTextDocument с абзацами (двойной перенос) → несколько параграфов', () => {
  const doc = plainTextDocument('paragraph 1\n\nparagraph 2\n\nparagraph 3');
  assert.equal(doc.content.length, 3);
  assert.equal(doc.content[1].content[0].text, 'paragraph 2');
});

test('markdownToEditorContent возвращает строку или doc', () => {
  // Без настроенного TipTap converter результат может быть null/пустой —
  // проверяем только, что функция не падает на разном вводе
  assert.doesNotThrow(() => markdownToEditorContent('# heading'));
  assert.doesNotThrow(() => markdownToEditorContent(''));
  assert.doesNotThrow(() => markdownToEditorContent(null));
});

test('список задач превращается в taskList с отметками', () => {
  const doc = markdownToEditorContent('- [x] сделано\n- [ ] не сделано\n');
  const list = doc.content.find((node) => node.type === 'taskList');
  assert.ok(list, 'ожидался узел taskList');
  assert.deepEqual(list.content.map((item) => item.attrs.checked), [true, false]);
  assert.equal(list.content[0].content[0].content[0].text, 'сделано');
  assert.equal(list.content[1].content[0].content[0].text, 'не сделано');
});

test('обычный маркированный список остаётся обычным', () => {
  const doc = markdownToEditorContent('- просто пункт\n- ещё пункт\n');
  const list = doc.content.find((node) => node.type === 'bulletList');
  assert.ok(list);
  assert.ok(list.content.every((item) => item.type === 'listItem'));
});

test('смешанный список сохраняет порядок и разделяет пункты и задачи', () => {
  const doc = markdownToEditorContent('- [x] задача\n- обычный пункт\n');
  const types = doc.content.map((n) => n.type);
  assert.deepEqual(types, ['taskList', 'bulletList'], `порядок нарушен: ${types}`);

  const taskText = (doc.content[0].content[0].content[0].content || []).map((c) => c.text).join('');
  assert.equal(taskText, 'задача', 'маркер должен исчезнуть из текста задачи');
  const bulletText = (doc.content[1].content[0].content[0].content || []).map((c) => c.text).join('');
  assert.equal(bulletText, 'обычный пункт', 'обычный пункт должен остаться текстом');
});

test('вложенная задача остаётся вложенной', () => {
  const doc = markdownToEditorContent('- [ ] внешняя\n  - [x] вложенная\n');
  const list = doc.content.find((node) => node.type === 'taskList');
  const outer = list.content[0];
  assert.equal(outer.type, 'taskItem');
  const nested = outer.content.find((node) => node.type === 'taskList');
  assert.ok(nested, 'ожидался вложенный список задач');
  assert.equal(nested.content[0].attrs.checked, true);
});

test('[x] в середине текста не превращается в задачу', () => {
  const doc = markdownToEditorContent('смотри [x] тут\n');
  assert.equal(doc.content.find((node) => node.type === 'taskList'), undefined);
  assert.ok(doc.content.find((node) => node.type === 'paragraph'));
});

test('задача в блоке кода остаётся текстом', () => {
  const doc = markdownToEditorContent('```\n- [x] пример\n```\n');
  assert.equal(doc.content.find((node) => node.type === 'taskList'), undefined);
});

test('смешанный список режется: обычные пункты и задачи получают свои узлы', () => {
  // Регрессия: смешанный список целиком оставался маркированным, задача теряла
  // галочку, а счётчик в заголовке её всё равно считал.
  const doc = markdownToEditorContent('- обычный\n- [x] сделано\n- [ ] ждёт\n- ещё\n');
  assert.deepEqual(doc.content.map((n) => n.type), ['bulletList', 'taskList', 'bulletList']);
  assert.equal(doc.content[1].content.length, 2);
  assert.deepEqual(doc.content[1].content.map((i) => i.attrs.checked), [true, false]);
  assert.equal(doc.content[0].content[0].content[0].content[0].text, 'обычный');
  assert.equal(doc.content[2].content[0].content[0].content[0].text, 'ещё');
});

test('вложенные задачи конвертируются на любой глубине', () => {
  const doc = markdownToEditorContent('- пункт\n  - [x] одна\n    - [ ] две\n  - пункт2\n');
  const outer = doc.content[0];
  const nestedTaskList = outer.content[0].content.find((c) => c.type === 'taskList');
  assert.ok(nestedTaskList, 'вложенный список задач не найден');
  assert.equal(nestedTaskList.content[0].attrs.checked, true);
  const deep = nestedTaskList.content[0].content.find((c) => c.type === 'taskList');
  assert.ok(deep, 'задача третьего уровня потеряна');
  assert.equal(deep.content[0].attrs.checked, false);
});

test('ничего не теряется при перегруппировке', () => {
  const md = '- раз\n- [x] два\n- три\n- [ ] четыре\n- пять\n';
  const texts = [];
  const walk = (node) => {
    if (node.type === 'paragraph') texts.push((node.content || []).map((c) => c.text || '').join(''));
    for (const child of node.content || []) walk(child);
  };
  for (const node of markdownToEditorContent(md).content) walk(node);
  assert.deepEqual(texts, ['раз', 'два', 'три', 'четыре', 'пять']);
});

// --- Язык ограждённых блоков -------------------------------------------------
//
// CommonMark-парсер выбрасывает info-строку, из-за чего attrs.language всегда
// был null: подсветка работала только по автоопределению, а при сохранении
// заметки терялись все ```bash / ```sql. Проверено сквозняком — правка в файл
// сохранялась как голый ```.

function codeBlockLanguages(doc) {
  const found = [];
  const walk = (nodes) => (nodes || []).forEach((node) => {
    if (node?.type === 'codeBlock') found.push(node.attrs?.language ?? null);
    if (Array.isArray(node?.content)) walk(node.content);
  });
  walk(doc.content);
  return found;
}

test('язык fenced-блока доезжает до узла codeBlock', () => {
  const doc = markdownToEditorContent('```bash\nsudo apt update\n```');
  assert.deepEqual(codeBlockLanguages(doc), ['bash']);
});

test('несколько блоков получают свои языки по порядку', () => {
  const doc = markdownToEditorContent([
    '```python',
    'print(1)',
    '```',
    'текст между',
    '```sql',
    'SELECT 1',
    '```',
    '```',
    'без языка',
    '```',
  ].join('\n'));
  assert.deepEqual(codeBlockLanguages(doc), ['python', 'sql', null]);
});

test('язык восстанавливается и когда в заметке есть таблица', () => {
  // Таблицы разбивают документ на чанки — язык должен пережить разбиение.
  const doc = markdownToEditorContent([
    '```bash',
    'echo hi',
    '```',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
  ].join('\n'));
  assert.deepEqual(codeBlockLanguages(doc), ['bash']);
});

test('блок внутри списка тоже получает язык', () => {
  const doc = markdownToEditorContent('- пункт\n\n  ```yaml\n  key: value\n  ```\n');
  assert.deepEqual(codeBlockLanguages(doc), ['yaml']);
});

test('закрывающие ограждения не считаются блоками', () => {
  // Три fence-строки = один блок; если бы закрывающая считалась открывающей,
  // число языков разошлось бы с числом узлов и ничего не проставилось бы.
  const doc = markdownToEditorContent('```\ncode\n```\n');
  assert.deepEqual(codeBlockLanguages(doc), [null]);
});

test('при несовпадении числа блоков и ограждений язык не проставляется', () => {
  // Отступный блок кода (без ограждения) сдвинул бы выравнивание — тогда
  // любая разметка была бы угадыванием, и мы не ставим ничего.
  const doc = markdownToEditorContent('```bash\nA\n```\n\n    отступный блок\n');
  assert.deepEqual(codeBlockLanguages(doc), [null, null]);
});

test('пустая задача «- [ ]» становится чекбоксом, а не текстом «[ ]»', () => {
  const doc = markdownToEditorContent('- [ ]\n- [x]\n- [ ] Текст');
  const list = doc.content.find((node) => node.type === 'taskList');
  assert.ok(list, 'пустые задачи собираются в taskList');
  const [empty, checked, filled] = list.content;
  assert.equal(empty.type, 'taskItem');
  assert.equal(empty.attrs.checked, false);
  assert.equal(empty.content[0].type, 'paragraph', 'абзац внутри задачи нужен даже пустой');
  assert.equal((empty.content[0].content || []).length, 0);
  assert.equal(checked.attrs.checked, true);
  assert.equal(filled.content[0].content[0].text, 'Текст');
  assert.doesNotMatch(JSON.stringify(doc), /\[ \]/);
});

test('fencedBlockLanguages читает только info-строку', () => {
  assert.deepEqual(fencedBlockLanguages('```bash extra\nx\n```'), ['bash']);
  assert.deepEqual(fencedBlockLanguages('~~~\nno lang\n~~~'), ['']);
});

test('~~текст~~ открывается как зачёркнутый, а не как буквальные тильды', () => {
  const doc = markdownToEditorContent('before ~~hello~~ after\n');
  const [paragraph] = doc.content;
  const struck = paragraph.content.find((node) => node.marks?.some((mark) => mark.type === 'strike'));
  assert.equal(struck?.text, 'hello');
  assert.ok(paragraph.content.every((node) => !String(node.text || '').includes('~~')));
});

test('одинарные тильды остаются текстом: ~sub~ не зачёркивание', () => {
  const doc = markdownToEditorContent('H~2~O\n');
  assert.equal(doc.content[0].content.map((node) => node.text).join(''), 'H~2~O');
  assert.ok(doc.content[0].content.every((node) => !node.marks?.length));
});

test('нумерованный список помнит первый номер и скобку', () => {
  const dotted = markdownToEditorContent('5. five\n6. six\n').content[0];
  assert.equal(dotted.type, 'orderedList');
  assert.equal(dotted.attrs.start, 5);
  assert.equal(dotted.attrs.delimiter, '.');
  const bracket = markdownToEditorContent('7) seven\n8) eight\n').content[0];
  assert.equal(bracket.attrs.start, 7);
  assert.equal(bracket.attrs.delimiter, ')');
});

test('список задач остаётся плотным или рыхлым, как в файле, и помнит маркер', () => {
  const tight = markdownToEditorContent('* [ ] one\n  * [x] nested\n* [x] two\n').content[0];
  assert.equal(tight.type, 'taskList');
  assert.equal(tight.attrs.tight, true);
  assert.equal(tight.attrs.marker, '*');
  const loose = markdownToEditorContent('- [ ] one\n\n- [x] two\n').content[0];
  assert.equal(loose.attrs.tight, false);
});

test('заголовок на несколько строк (setext) не теряет текст', () => {
  const doc = markdownToEditorContent('first line\nsecond line\n---\n\nbody\n');
  assert.equal(doc.content[0].type, 'heading');
  const text = doc.content[0].content.map((node) => node.text || ' ').join('');
  assert.match(text, /first line/);
  assert.match(text, /second line/);
});

test('ячейка таблицы с \\| остаётся одной ячейкой', () => {
  const table = markdownToEditorContent('| a | b |\n| --- | --- |\n| x \\| y | 2 |\n').content[0];
  const row = table.content[1];
  assert.equal(row.content.length, 2);
  assert.equal(row.content[0].content[0].content[0].text, 'x | y');
});
