import test from 'node:test';
import assert from 'node:assert/strict';
import { convertMarkdownExtras, findInlineMath } from './markdown-extras.js';

const text = (t) => ({ type: 'text', text: t });
const paragraph = (...children) => ({ type: 'paragraph', content: children });
const codeBlock = (lang, body) => ({ type: 'codeBlock', attrs: { language: lang }, content: [text(body)] });

test('формула на отдельной строке становится блочным узлом', () => {
  const out = convertMarkdownExtras([paragraph(text('$$E = mc^2$$'))]);
  assert.deepEqual(out[0], { type: 'mathBlock', attrs: { latex: 'E = mc^2' } });
});

test('многострочная формула сохраняется целиком', () => {
  const out = convertMarkdownExtras([paragraph(text('$$\n\\frac{a}{b} = c\n$$'))]);
  assert.equal(out[0].type, 'mathBlock');
  assert.equal(out[0].attrs.latex, '\\frac{a}{b} = c');
});

test('формула внутри предложения остаётся в абзаце и делится на части', () => {
  const out = convertMarkdownExtras([paragraph(text('Цена $x^2 + y^2$ растёт'))]);
  assert.equal(out[0].type, 'paragraph');
  assert.deepEqual(out[0].content.map((c) => c.type), ['text', 'inlineMath', 'text']);
  assert.equal(out[0].content[1].attrs.latex, 'x^2 + y^2');
  assert.equal(out[0].content[0].text, 'Цена ');
  assert.equal(out[0].content[2].text, ' растёт');
});

test('несколько формул в одном абзаце', () => {
  const out = convertMarkdownExtras([paragraph(text('$a$ и $b$'))]);
  assert.deepEqual(out[0].content.map((c) => c.type), ['inlineMath', 'text', 'inlineMath']);
});

test('деньги не превращаются в формулу', () => {
  const out = convertMarkdownExtras([paragraph(text('Зарплата $5 и $10 в день'))]);
  assert.equal(out[0].type, 'paragraph');
  assert.ok(out[0].content.every((c) => c.type === 'text'), 'должны остаться текстовыми узлами');
  assert.equal(out[0].content.map((c) => c.text).join(''), 'Зарплата $5 и $10 в день');
});

test('незакрытая долларовая строка остаётся текстом', () => {
  const out = convertMarkdownExtras([paragraph(text('цена $ не указана'))]);
  assert.ok(out[0].content.every((c) => c.type === 'text'));
});

test('блок кода mermaid превращается в узел диаграммы', () => {
  const out = convertMarkdownExtras([codeBlock('mermaid', 'graph TD;\n  A-->B;')]);
  assert.deepEqual(out[0], { type: 'mermaidBlock', attrs: { code: 'graph TD;\n  A-->B;' } });
});

test('язык кода mermaid нечувствителен к регистру', () => {
  const out = convertMarkdownExtras([codeBlock('Mermaid', 'graph TD;')]);
  assert.equal(out[0].type, 'mermaidBlock');
});

test('обычный блок кода не трогается', () => {
  const out = convertMarkdownExtras([codeBlock('js', 'const a = $x;')]);
  assert.equal(out[0].type, 'codeBlock');
  assert.equal(out[0].attrs.language, 'js');
});

test('обычный текст не меняется', () => {
  const out = convertMarkdownExtras([paragraph(text('Просто предложение без формул.'))]);
  assert.deepEqual(out[0], paragraph(text('Просто предложение без формул.')));
});

test('конвертация заходит внутрь вложенных узлов', () => {
  const doc = [{
    type: 'bulletList',
    content: [{ type: 'listItem', content: [paragraph(text('$a+b$'))] }],
  }];
  const out = convertMarkdownExtras(doc);
  const para = out[0].content[0].content[0];
  assert.equal(para.content[0].type, 'inlineMath');
  assert.equal(para.content[0].attrs.latex, 'a+b');
});

test('заголовки и цитаты остаются на месте', () => {
  const doc = [
    { type: 'heading', attrs: { level: 2 }, content: [text('Модель')] },
    { type: 'blockquote', content: [paragraph(text('$x$'))] },
  ];
  const out = convertMarkdownExtras(doc);
  assert.equal(out[0].type, 'heading');
  assert.equal(out[1].content[0].content[0].type, 'inlineMath');
});

test('findInlineMath достаёт формулу из строки', () => {
  assert.equal(findInlineMath('значение $x^2$ тут'), 'x^2');
  assert.equal(findInlineMath('ничего тут'), null);
});

test('пустой вход не падает', () => {
  assert.deepEqual(convertMarkdownExtras([]), []);
  assert.deepEqual(convertMarkdownExtras(null), []);
});
test('язык fence читается и из params, и из language', () => {
  // prosemirror-markdown отдаёт `params`, узел редактора — `language`. Раньше
  // проверка смотрела только на `language`, и диаграммы не появлялись вовсе.
  const viaParams = convertMarkdownExtras([{ type: 'codeBlock', attrs: { params: 'mermaid' }, content: [text('graph TD;')] }]);
  assert.equal(viaParams[0].type, 'mermaidBlock');

  const viaLanguage = convertMarkdownExtras([codeBlock('mermaid', 'graph TD;')]);
  assert.equal(viaLanguage[0].type, 'mermaidBlock');

  const jsBlock = convertMarkdownExtras([{ type: 'codeBlock', attrs: { params: 'js' }, content: [text('const a = 1;')] }]);
  assert.equal(jsBlock[0].type, 'codeBlock', 'чужой язык остаётся блоком кода');
});

test('интеграция: реальный markdown целиком', async () => {
  const { markdownToEditorContent } = await import('./markdown-editor-content.js');
  const md = [
    'Формула $a^2$ и текст.',
    '',
    '$$',
    '\\sum x',
    '$$',
    '',
    '```mermaid',
    'graph TD;',
    '  A-->B;',
    '```',
    '',
  ].join('\n');

  const doc = markdownToEditorContent(md);
  const types = doc.content.map((n) => n.type);
  assert.ok(types.includes('mathBlock'), `нет блочной формулы: ${types}`);
  assert.ok(types.includes('mermaidBlock'), `нет диаграммы: ${types}`);

  // Инлайн-формула лежит внутри абзаца, а не рядом с ним.
  const first = doc.content.find((n) => n.type === 'paragraph');
  assert.ok(first, 'нет абзаца');
  const inline = (first.content || []).find((n) => n.type === 'inlineMath');
  assert.ok(inline, `нет инлайн-формулы: ${JSON.stringify(first.content)}`);
  assert.equal(inline.attrs.latex, 'a^2');
});

test('жирный и курсив переживают разделение на формулу', () => {
  // Регрессия: сплиттер собирал текстовые узлы заново и терял marks — абзац
  // целиком слетал с жирного и курсивного.
  const withText = convertMarkdownExtras([
    paragraph({ type: 'text', marks: [{ type: 'bold' }], text: 'жирно $x$ ещё жирно' }),
  ]).at(0).content;

  assert.equal(withText[0].type, 'text');
  assert.equal(withText[0].text, 'жирно ');
  assert.deepEqual(withText[0].marks, [{ type: 'bold' }]);
  assert.equal(withText[1].type, 'inlineMath');
  assert.equal(withText[1].attrs.latex, 'x');
  assert.equal(withText[2].text, ' ещё жирно');
  assert.deepEqual(withText[2].marks, [{ type: 'bold' }]);

  // Абзац без формул не должен меняться вообще.
  const plain = convertMarkdownExtras([
    paragraph({ type: 'text', marks: [{ type: 'italic' }], text: 'курсив' }),
  ]).at(0).content;
  assert.deepEqual(plain, [{ type: 'text', marks: [{ type: 'italic' }], text: 'курсив' }]);
});
