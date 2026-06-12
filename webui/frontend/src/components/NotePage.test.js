import { test, expect } from 'vitest';
import { getFileFromCleanPath } from './NotePage.svelte';

test('getFileFromCleanPath преобразует clean path в путь для backend', () => {
  expect(getFileFromCleanPath('Work/My%20Note.md')).toEqual({
    path: 'notes/Work/My Note.md',
    name: 'My Note.md',
    isDir: false,
  });
});

test('getFileFromCleanPath возвращает null для пустого пути', () => {
  expect(getFileFromCleanPath('')).toBeNull();
  expect(getFileFromCleanPath(null)).toBeNull();
});
