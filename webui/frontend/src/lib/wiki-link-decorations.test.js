import test from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { collectBareUrls, collectWikiLinks, isOpenableUrl, wikiLinkAt, wikiLinkKey, wikiLinkStatus } from './wiki-link-decorations.js';
import { newNoteForWikiLink, wikiLinkSpans } from './wiki-links.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    codeBlock: { group: 'block', content: 'text*', code: true, marks: '' },
    image: { group: 'inline', inline: true, atom: true },
    text: { group: 'inline' },
  },
  marks: { code: { code: true }, bold: {}, link: { attrs: { href: {} } } },
});

const p = (...parts) => schema.node('paragraph', null, parts);
const t = (text, marks = []) => schema.text(text, marks.map((name) => schema.mark(name)));

test('wikiLinkSpans: цель, подпись и место ссылки; вставки и пустые ссылки пропускаются', () => {
  assert.deepEqual(wikiLinkSpans('См. [[План|наш план]] и [[Идеи]].'), [
    { start: 4, end: 21, target: 'План', alias: 'наш план' },
    { start: 24, end: 32, target: 'Идеи', alias: null },
  ]);
  assert.deepEqual(wikiLinkSpans('![[картинка.png]] и [[ ]] и [[незакрытая'), []);
  assert.deepEqual(wikiLinkSpans('[[a\u0001b]]'), []);
});

test('collectWikiLinks: позиции в документе, код и вставки не ссылки', () => {
  const doc = schema.node('doc', null, [
    p(t('До '), t('[[Альфа]]', ['bold']), t(' после')),
    p(t('[[в коде]]', ['code']), t(' и [[Бета#Шаги]]')),
    schema.node('codeBlock', null, [t('[[в блоке кода]]')]),
    p(t('[[через '), schema.node('image'), t(' картинку]]')),
  ]);
  const links = collectWikiLinks(doc);
  assert.deepEqual(links.map((link) => link.target), ['Альфа', 'Бета#Шаги']);
  const [alpha] = links;
  assert.equal(doc.textBetween(alpha.from, alpha.to), '[[Альфа]]');
  assert.equal(doc.textBetween(links[1].from, links[1].to), '[[Бета#Шаги]]');
  assert.equal(wikiLinkAt(links, alpha.from + 3), alpha);
  assert.equal(wikiLinkAt(links, alpha.to + 3), null);
});

test('wikiLinkStatus и wikiLinkKey: найдено, несколько, нет; одна форма Unicode', () => {
  assert.deepEqual(wikiLinkStatus({ path: 'notes/A.md', name: 'A' }), { kind: 'found', path: 'notes/A.md', name: 'A' });
  assert.equal(wikiLinkStatus({ ambiguous: true, matches: [{ path: 'notes/x/A.md', name: 'A' }, { path: 'notes/y/A.md', name: 'A' }] }).kind, 'ambiguous');
  assert.deepEqual(wikiLinkStatus({}), { kind: 'missing' });
  assert.equal(wikiLinkKey(' Йод '.normalize('NFD')), 'Йод');
});

test('newNoteForWikiLink: папка из пути, заголовок отбрасывается, «Issue #42» остаётся именем', () => {
  assert.deepEqual(newNoteForWikiLink('Идея'), { title: 'Идея', category: '' });
  assert.deepEqual(newNoteForWikiLink('Проекты/План#Шаги'), { title: 'План', category: 'Проекты' });
  assert.deepEqual(newNoteForWikiLink('Issue #42'), { title: 'Issue #42', category: '' });
});

test('collectBareUrls: адрес без знаков препинания в конце; код и готовые ссылки пропускаются', () => {
  const doc = schema.node('doc', null, [
    p(t('См. https://example.com/a?b=1, и (http://x.org).')),
    p(t('https://in.code', ['code']), t(' и '), schema.text('https://linked.org', [schema.mark('link', { href: 'https://linked.org' })])),
  ]);
  const urls = collectBareUrls(doc);
  assert.deepEqual(urls.map((u) => u.href), ['https://example.com/a?b=1', 'http://x.org']);
  assert.equal(doc.textBetween(urls[0].from, urls[0].to), 'https://example.com/a?b=1');
  assert.equal(isOpenableUrl('https://a.b'), true);
  assert.equal(isOpenableUrl('mailto:a@b.c'), true);
  assert.equal(isOpenableUrl('javascript:alert(1)'), false);
  assert.equal(isOpenableUrl('file:///etc/passwd'), false);
});
