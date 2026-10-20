import test from 'node:test';
import assert from 'node:assert/strict';
import { helpSections } from './help-content.js';
import { searchHelp } from './help-search.js';

const shape = (sections) => sections.map((section) => [section.id, section.items.map((item) => item.id)]);

test('в обоих языках одни и те же разделы и темы, ничего пустого и без повторов', () => {
  const ru = helpSections('ru');
  const en = helpSections('en');
  assert.deepEqual(shape(ru), shape(en));
  for (const sections of [ru, en]) {
    const ids = new Set();
    for (const section of sections) {
      assert.ok(section.title);
      for (const item of section.items) {
        const key = `${section.id}/${item.id}`;
        assert.ok(!ids.has(key), key);
        ids.add(key);
        assert.ok(item.title && item.body.length > 40, key);
      }
    }
  }
  assert.equal(ru.at(-1).id, 'faq');
});

test('любой язык, кроме русского, читает английскую справку', () => {
  assert.equal(helpSections('de'), helpSections('en'));
});

test('частые вопросы находятся поиском', () => {
  assert.equal(searchHelp(helpSections('ru'), 'конфликт')[0].itemId, 'conflicts');
  assert.ok(searchHelp(helpSections('ru'), 'пароль').some((r) => r.itemId === 'forgot-password'));
  assert.ok(searchHelp(helpSections('en'), 'terminal').some((r) => r.itemId === 'terminal'));
});

// The keys table: the same rows in both languages, grouped, and every row names keys the app really answers
// (the e2e hotkey spec presses each of them).
const keyRows = (sections) => {
  const article = sections.flatMap((section) => section.items).find((item) => item.id === 'shortcuts');
  // Only the keys themselves (the backticked words), not the "or" between them, which is language.
  return article.body.split('\n').filter((line) => /^\| `/.test(line)).map((line) => [...line.split('|')[1].matchAll(/`([^`]+)`/g)].map((m) => m[1].replace(/клик/, 'click')).join(' '));
};

test('горячие клавиши: те же строки на обоих языках и все основные на месте', () => {
  const ru = keyRows(helpSections('ru'));
  const en = keyRows(helpSections('en'));
  assert.deepEqual(ru, en);
  const joined = ru.join(' ');
  for (const key of ['⌘K', '⌘O', '⌘N', '⌘B', '⌘J', 'Esc', '⌘⇧F', '⌘S', '⌘W', '⌘,', '⌘/', '⌘Z', '⌘⇧Z', '⌘I', '⌘E', '⌘Enter', '⌘-', 'Shift+F10', '⌘F']) {
    assert.ok(joined.includes(key), `в таблице нет ${key}`);
  }
  const groups = (sections) => sections.flatMap((s) => s.items).find((i) => i.id === 'shortcuts').body.match(/^\*\*.+\*\*$/gm);
  assert.equal(groups(helpSections('ru')).length, 5);
  assert.equal(groups(helpSections('en')).length, 5);
});

test('platformKeys: на Mac символы, на остальных Ctrl и Shift', async () => {
  const { platformKeys } = await import('./shortcut-label.js');
  assert.equal(platformKeys('⌘K', true), '⌘K');
  assert.equal(platformKeys('⌘K', false), 'Ctrl+K');
  assert.equal(platformKeys('⌘⇧F', false), 'Ctrl+Shift+F');
  assert.equal(platformKeys('⌘-клик, ⌘Enter', false), 'Ctrl+клик, Ctrl+Enter');
  assert.equal(platformKeys('⌘-click', false), 'Ctrl+click');
  assert.equal(platformKeys('Shift+F10', false), 'Shift+F10');
});
