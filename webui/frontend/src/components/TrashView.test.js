import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import { locale, uiText } from '../lib/strings.js';

const api = vi.hoisted(() => ({
  deleteFilePermanentlyRequest: vi.fn(),
  loadTrashNotesRequest: vi.fn(),
  restoreNoteRequest: vi.fn(),
}));

vi.mock('../lib/editor-api.js', () => api);

import TrashView from './TrashView.svelte';

beforeEach(() => {
  locale.set('en');
  globalThis.confirm = vi.fn(() => true);
  api.deleteFilePermanentlyRequest.mockReset();
  api.loadTrashNotesRequest.mockReset();
  api.restoreNoteRequest.mockReset();
});

test('TrashView восстанавливает и окончательно удаляет заметки', async () => {
  const initialNotes = [
    {
      path: 'notes/Old.md',
      name: 'Old',
      excerpt: 'Old body',
      trashedAt: '2026-06-13T10:00:00.000Z',
    },
    {
      path: 'notes/Gone.md',
      name: 'Gone',
      excerpt: 'Gone body',
      trashedAt: '2026-06-13T11:00:00.000Z',
    },
  ];
  api.restoreNoteRequest.mockResolvedValue({ path: 'notes/Old.md', name: 'Old' });
  api.deleteFilePermanentlyRequest.mockResolvedValue({ message: 'Deleted' });

  render(TrashView, { initialNotes });

  await waitFor(() => expect(screen.getByText('Old')).toBeTruthy());
  await fireEvent.click(screen.getAllByRole('button', { name: uiText.trash.restore })[0]);
  await waitFor(() => expect(screen.queryByText('Old')).toBeNull());

  await fireEvent.click(screen.getByRole('button', { name: uiText.trash.deleteForever }));
  await waitFor(() => expect(screen.queryByText('Gone')).toBeNull());

  expect(api.restoreNoteRequest).toHaveBeenCalledWith('notes/Old.md');
  expect(api.deleteFilePermanentlyRequest).toHaveBeenCalledWith('notes/Gone.md');
});
