import test from 'node:test';
import assert from 'node:assert/strict';
import { documentTitle } from './document-title.js';
import { translations } from './strings.js';

const en = translations.en;
const ru = translations.ru;

test('доска называется просто Monos, остальные страницы — по имени', () => {
  assert.equal(documentTitle({ route: '/', texts: en }), 'Monos');
  assert.equal(documentTitle({ route: '/settings', texts: en }), 'Settings — Monos');
  assert.equal(documentTitle({ route: '/trash', texts: ru }), `${ru.trash.title} — Monos`);
  assert.equal(documentTitle({ route: '/properties', texts: en }), `${en.properties.tableTitle} — Monos`);
  assert.equal(documentTitle({ route: '/help?topic=x', texts: en }), 'Help — Monos');
});

test('заметка называется по своему заголовку, как окно в приложении', () => {
  assert.equal(documentTitle({ route: '/notes/Work/CV.md', noteTitle: 'CV', texts: en }), 'CV — Monos');
});

test('пока заголовок заметки не пришёл, берётся имя из адреса, и битый адрес не роняет', () => {
  assert.equal(documentTitle({ route: '/notes/Work/C%23%20notes.md', texts: en }), 'C# notes — Monos');
  assert.equal(documentTitle({ route: '/notes/100%%20done.md', texts: en }), '100%%20done — Monos');
});

test('неизвестный адрес называется «страница не найдена»', () => {
  assert.equal(documentTitle({ route: '/nowhere', texts: en }), 'Page not found — Monos');
});
