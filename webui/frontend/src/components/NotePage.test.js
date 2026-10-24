import { test, expect } from 'vitest';
import { getFileFromCleanPath } from './NotePage.svelte';

test('getFileFromCleanPath преобразует clean path в путь для backend', () => {
  expect(getFileFromCleanPath('Work/My Note.md')).toEqual({
    path: 'notes/Work/My Note.md',
    name: 'My Note.md',
    isDir: false,
  });
});

test('getFileFromCleanPath возвращает null для пустого пути', () => {
  expect(getFileFromCleanPath('')).toBeNull();
  expect(getFileFromCleanPath(null)).toBeNull();
});

test('getFileFromCleanPath не декодирует повторно: роутер уже декодировал адрес', () => {
  expect(getFileFromCleanPath('100% done.md').path).toBe('notes/100% done.md');
  expect(getFileFromCleanPath('a%2Fb.md').path).toBe('notes/a%2Fb.md');
  expect(getFileFromCleanPath('C# notes.md').name).toBe('C# notes.md');
});
