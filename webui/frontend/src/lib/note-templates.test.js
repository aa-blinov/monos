import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noteTemplates,
  getLocalizedTemplates,
  getTemplateById,
  getTemplateContext,
  buildTemplateContent,
} from './note-templates.js';
import { fileNameProblem } from './file-name.js';

test('noteTemplates — непустой массив', () => {
  assert.ok(Array.isArray(noteTemplates));
  assert.ok(noteTemplates.length >= 10, 'должно быть много встроенных шаблонов');
});

test('каждый шаблон имеет id, title, group, content', () => {
  for (const t of noteTemplates) {
    assert.ok(t.id, `шаблон без id: ${JSON.stringify(t)}`);
    assert.ok(t.title, `шаблон ${t.id} без title`);
    assert.ok(t.group, `шаблон ${t.id} без group`);
    assert.equal(typeof t.content, 'function', `шаблон ${t.id} content должен быть функцией`);
  }
});

test('getLocalizedTemplates возвращает массив', () => {
  const list = getLocalizedTemplates('en');
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0);
});

test('getTemplateById находит известный шаблон', () => {
  const t = getTemplateById('daily-note');
  assert.ok(t);
  assert.equal(t.id, 'daily-note');
});

test('getTemplateById для неизвестного возвращает первый шаблон (fallback)', () => {
  // контракт: не падает, а возвращает хоть что-то разумное
  const t = getTemplateById('does-not-exist');
  assert.ok(t);
  assert.ok(t.id);
});

test('название шаблона с датой пишется ISO, как даты внутри шаблона', () => {
  const daily = noteTemplates.find((template) => template.id === 'daily-note');
  const ctx = getTemplateContext('', new Date(2026, 0, 15, 9, 30));
  assert.equal(daily.suggestedTitle(ctx), 'Daily 2026-01-15');
});

test('каждый шаблон предлагает название, которое можно создать в любой ОС', () => {
  const ctx = getTemplateContext('', new Date(2026, 0, 15, 9, 30), 'ru');
  for (const template of noteTemplates) {
    const title = template.suggestedTitle?.(ctx) || template.title;
    assert.equal(fileNameProblem(title), null, `${template.id}: «${title}»`);
  }
});

test('по-русски даты в шаблонах пишутся через точку', () => {
  const daily = noteTemplates.find((template) => template.id === 'daily-note');
  const date = new Date(2026, 0, 15, 9, 30);
  assert.equal(daily.suggestedTitle(getTemplateContext('', date, 'ru')), 'Daily 15.01.2026');
  assert.match(buildTemplateContent(daily, 'Утро', date, 'ru'), /Date: 15\.01\.2026/);
});

test('getTemplateContext возвращает localDate и time', () => {
  const ctx = getTemplateContext('My Title', new Date(2026, 0, 15, 14, 30, 45));
  assert.equal(ctx.title, 'My Title');
  assert.match(ctx.localDate, /2026-01-15/);
  assert.match(ctx.time, /14:30/);
});

test('buildTemplateContent для daily-note возвращает Markdown с датой', () => {
  const t = getTemplateById('daily-note');
  const md = buildTemplateContent(t, 'My Day', new Date(2026, 0, 15, 14, 30, 45));
  assert.match(md, /Date: 2026-01-15/);
  assert.match(md, /Started: 14:30/);
  assert.match(md, /## Focus/);
});

test('каждый шаблон переведён: название, описание, группа, категория и предложенное название', () => {
  const en = getLocalizedTemplates('en');
  const date = new Date(2026, 0, 15, 9, 30);
  for (const ru of getLocalizedTemplates('ru')) {
    const enTemplate = en.find((template) => template.id === ru.id);
    assert.ok(enTemplate, `${ru.id}: нет английской версии`);
    for (const field of ['title', 'description', 'category', 'group', 'approachTitle']) {
      assert.notEqual(ru[field], enTemplate[field], `${ru.id}: ${field} не переведено`);
    }
    assert.notEqual(
      ru.suggestedTitle(getTemplateContext('', date, 'ru')),
      enTemplate.suggestedTitle(getTemplateContext('', date, 'en')),
      `${ru.id}: предложенное название не переведено`,
    );
  }
});

test('в русских названиях, описаниях и тексте шаблонов нет английских слов, кроме названий методик', () => {
  const methods = new Set(['moc', 'zettel', 'zettelkasten', 'gtd', 'url', 'rfc', 'adr', 'okr', 'cornell', 'eisenhower']);
  const date = new Date(2026, 0, 15, 9, 30);
  for (const ru of getLocalizedTemplates('ru')) {
    const texts = [
      ru.title,
      ru.description,
      ru.category,
      ru.approachDescription,
      ru.suggestedTitle(getTemplateContext('', date, 'ru')),
      buildTemplateContent(ru, ru.title, date, 'ru'),
    ];
    const english = texts
      .flatMap((text) => text.match(/[A-Za-z][A-Za-z']{2,}/g) || [])
      .filter((word) => !methods.has(word.toLowerCase()));
    assert.deepEqual(english, [], `${ru.id}: английские слова в русском тексте`);
  }
});
