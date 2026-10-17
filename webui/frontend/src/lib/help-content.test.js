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
