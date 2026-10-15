import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWikiLinks,
  folderLinkPatterns,
  headingLinkPattern,
  linkFirstMention,
  linkNameCandidates,
  noteLinkNames,
  phraseRegExp,
  plainTextForMentions,
} from './utils.js';

test('ссылка с папкой [[Projects/Plan]] указывает на заметку Plan, а не на папку', () => {
  assert.deepEqual(linkNameCandidates('Projects/Plan'), ['Projects/Plan', 'Plan']);
  assert.deepEqual(linkNameCandidates('Projects/Plan#Раздел'), ['Projects/Plan#Раздел', 'Projects/Plan', 'Plan']);
  // Нет имени после последнего «/» — и искать нечего.
  assert.deepEqual(linkNameCandidates('Plan/'), ['Plan/']);
  assert.deepEqual(folderLinkPatterns('a_b'), ['%/a\\_b', '%/a\\_b#%']);
});

test('цель ссылки без подписи и заголовка: [[Name#Heading|подпись]] даёт Name#Heading, [[#H]] не даёт ничего', () => {
  assert.deepEqual(extractWikiLinks('[[Beta]] [[ Gamma |подпись]] [[Delta#Раздел|x]] [[#Здесь]]'), [
    'Beta',
    'Gamma',
    'Delta#Раздел',
  ]);
});

test('ссылка в коде не попадает в связи', () => {
  assert.deepEqual(extractWikiLinks('`[[Beta]]`\n\n```\n[[Gamma]]\n```\n\n[[Delta]]'), ['Delta']);
});

test('linkNameCandidates: сначала целая цель, потом имя до #; имя с # тоже находится', () => {
  assert.deepEqual(linkNameCandidates('Beta'), ['Beta']);
  assert.deepEqual(linkNameCandidates('Beta#Раздел'), ['Beta#Раздел', 'Beta']);
  assert.deepEqual(linkNameCandidates('Issue #42'), ['Issue #42', 'Issue ']);
});

test('noteLinkNames: имя файла без .md, заголовок и алиасы в NFC без повторов', () => {
  const decomposed = 'café'.normalize('NFD');
  assert.deepEqual(
    noteLinkNames({ name: `${decomposed}.md`, name_nfc: `${decomposed}.md`, title: 'Кофе' }, ['Эспрессо', 'Эспрессо']),
    ['café', 'Кофе', 'Эспрессо'],
  );
});

test('headingLinkPattern экранирует LIKE-символы', () => {
  assert.equal(headingLinkPattern('50%_план'), '50\\%\\_план#%');
});

test('plainTextForMentions сохраняет длину и прячет код, ссылки, URL и шапку', () => {
  const content = [
    '---',
    'title: Beta',
    '---',
    '',
    'Beta в тексте `Beta` и [[Beta]] и [Beta](https://x.test/Beta) https://x.test/Beta <b>Beta</b>',
  ].join('\n');
  const plain = plainTextForMentions(content);
  assert.equal(plain.length, content.length);
  assert.equal(plain.split('\n').length, content.split('\n').length);
  // Left: the prose and the text inside <b>, which is prose. Gone: the title, code, link, URL, wiki-link.
  assert.equal(plain.match(/Beta/g).length, 2);
  assert.ok(plain.includes('Beta в тексте'));
  assert.ok(!plain.includes('title'));
  assert.ok(!plain.includes('x.test'));
});

test('phraseRegExp: целое слово, без учёта регистра, в обеих Unicode-формах', () => {
  assert.ok(phraseRegExp('Beta').test('сегодня beta готова'));
  assert.equal(phraseRegExp('Beta').test('Betamax'), false);
  assert.equal(phraseRegExp('Beta').test('сверхBeta'), false);
  assert.ok(phraseRegExp('Йога').test('занятие ' + 'Йога'.normalize('NFD')));
  assert.ok(phraseRegExp('Чай').test('Чай'.normalize('NFD')));
  assert.equal(phraseRegExp('Note (draft)').test('Note (draft) final'), true);
});

test('linkFirstMention связывает первое упоминание в прозе, не в коде и не в ссылке', () => {
  assert.deepEqual(linkFirstMention('Код `Beta` и Beta.', 'Beta', 'Beta'), {
    content: 'Код `Beta` и [[Beta]].',
    count: 1,
  });
  assert.deepEqual(linkFirstMention('см. beta здесь', 'Beta', 'Beta'), {
    content: 'см. [[Beta|beta]] здесь',
    count: 1,
  });
  assert.deepEqual(linkFirstMention('[[Beta]] уже ссылка', 'Beta', 'Beta'), {
    content: '[[Beta]] уже ссылка',
    count: 0,
  });
});
