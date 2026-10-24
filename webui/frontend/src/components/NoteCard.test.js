import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';
import NoteCard from './NoteCard.svelte';
import { agentReview } from '../lib/agent-review.js';
import { conflictedNotes } from '../lib/git-conflicts.js';
import { locale } from '../lib/strings.js';

beforeEach(() => {
  locale.set('en');
  agentReview.set({ changes: [] });
  conflictedNotes.set(new Set());
});

afterEach(() => {
  agentReview.set({ changes: [] });
  conflictedNotes.set(new Set());
});

const note = {
  path: 'notes/Alpha.md',
  name: 'Alpha',
  excerpt: 'Some text',
  tags: [],
  modified: new Date().toISOString(),
};

test('метка агента стоит рядом с датой, а не над ней', () => {
  agentReview.set({ changes: [{ path: 'notes/Alpha.md', status: 'modified' }] });
  render(NoteCard, { note });

  const mark = screen.getByTestId('card-agent');
  const row = mark.closest('.justify-between');
  expect(row.querySelector('time')).not.toBeNull();
  expect(row.className).toContain('justify-between');
  expect(row.lastElementChild.contains(mark)).toBe(true);
});

test('заметка с конфликтом показывает состояние «Конфликт», а не строки <<<<<<<', () => {
  render(NoteCard, { note: { ...note, conflict: true, excerpt: '<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> origin' } });
  expect(screen.getByTestId('card-conflict-excerpt').textContent).toContain('Conflict');
  expect(document.body.textContent).not.toContain('<<<<<<<');
});

test('конфликт виден и по самому тексту выдержки, пока список не успел сказать', () => {
  render(NoteCard, { note: { ...note, excerpt: 'a\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> origin\nb' } });
  expect(screen.getByTestId('card-conflict-excerpt')).toBeTruthy();
  expect(document.body.textContent).not.toContain('<<<<<<<');
});

test('закрытая заметка говорит, что она закрыта, а не «пустая»', () => {
  render(NoteCard, { note: { ...note, locked: true, excerpt: '' } });
  expect(screen.getByTestId('card-locked-excerpt').textContent).toBe('This note is locked');
});

test('поиск, совпавший далеко в длинном названии, показывает часть названия вокруг совпадения', () => {
  const name = 'A very long note title that goes on and on and on past the end of the line for sure yes';
  const { container } = render(NoteCard, { note: { ...note, name, excerpt: 'text' }, query: 'goes', highlight: true });
  const title = container.querySelector('.font-serif');
  expect(title.querySelector('mark')?.textContent).toBe('goes');
  expect(title.textContent.trim().startsWith('…')).toBe(true);
  expect(title.textContent.length).toBeLessThan(name.length);
});

test('короткое название при поиске остаётся целым', () => {
  const { container } = render(NoteCard, { note: { ...note, name: 'Short title', excerpt: 'text' }, query: 'short', highlight: true });
  expect(container.querySelector('.font-serif').textContent.trim()).toBe('Short title');
});
