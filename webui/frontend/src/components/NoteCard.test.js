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
