import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forgetSession,
  isLockedNote,
  lockContent,
  moveSession,
  readWithSession,
  rememberSession,
  sealWithSession,
  sessionFor,
  unlockContent,
} from './note-lock.js';

const original = '﻿---\r\ntitle: Секрет\r\ntags: [личное]\r\n---\r\n\r\nПароль от банка: 1234\r\n';

test('заблокированная заметка возвращается байт в байт: BOM, CRLF и шапка на месте', () => {
  const { text } = lockContent(original, 'фраза');
  const { plaintext } = unlockContent(text, 'фраза');
  assert.equal(plaintext, original);
});

test('в заблокированном файле нет ни текста, ни заголовка, только метка и конверт', () => {
  const { text } = lockContent(original, 'фраза');
  assert.match(text, /^---\nmonos-locked: true\n---\n/);
  assert.equal(text.includes('Секрет'), false);
  assert.equal(text.includes('1234'), false);
  assert.equal(isLockedNote(text), true);
});

test('обычная заметка и заметка, которая лишь цитирует метку, заблокированными не считаются', () => {
  assert.equal(isLockedNote(original), false);
  assert.equal(isLockedNote('---\ntitle: Пример\n---\n\n-----BEGIN MONOS LOCKED NOTE-----\n-----END MONOS LOCKED NOTE-----\n'), false);
});

test('неверная парольная фраза не открывает файл', () => {
  const { text } = lockContent(original, 'фраза');
  assert.throws(() => unlockContent(text, 'другая'), (error) => error.statusCode === 403);
});

test('изменённый конверт не открывается: тег GCM не сходится', () => {
  const { text } = lockContent(original, 'фраза');
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.length === 76);
  const tampered = lines.map((line, i) => (i === index ? `${line.slice(0, -2)}AA` : line)).join('\n');
  assert.throws(() => unlockContent(tampered, 'фраза'), (error) => error.statusCode === 403 || error.statusCode === 400);
});

test('повреждённый блок отвечает ошибкой формата, а не падает', () => {
  const broken = '---\nmonos-locked: true\n---\n\n-----BEGIN MONOS LOCKED NOTE-----\nне base64!\n-----END MONOS LOCKED NOTE-----\n';
  assert.throws(() => unlockContent(broken, 'фраза'), (error) => error.statusCode === 400);
});

test('пустая парольная фраза не принимается', () => {
  assert.throws(() => lockContent(original, ''), (error) => error.statusCode === 400);
});

test('сохранение открытой заметки шифруется заново: в файле снова нет текста, открывается новым содержимым', () => {
  const { text, session } = lockContent(original, 'фраза');
  const next = sealWithSession('Новый текст', session);
  assert.equal(next.includes('Новый текст'), false);
  assert.notEqual(next, text);
  assert.equal(readWithSession(next, session), 'Новый текст');
});

test('ключ сессии помнится по пути заметки, переносится при переименовании и забывается', () => {
  const { session } = lockContent(original, 'фраза');
  rememberSession('notes/Secret.md', session);
  assert.equal(sessionFor('notes/Secret.md'), session);
  moveSession('notes/Secret.md', 'notes/Archive/Secret.md');
  assert.equal(sessionFor('notes/Secret.md'), null);
  assert.equal(sessionFor('notes/Archive/Secret.md'), session);
  forgetSession('notes/Archive/Secret.md');
  assert.equal(sessionFor('notes/Archive/Secret.md'), null);
});
