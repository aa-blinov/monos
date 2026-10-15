import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import CreateNoteModal from './CreateNoteModal.svelte';
import { ApiError } from '../lib/api/client.js';
import { locale, uiText } from '../lib/strings.js';

const createNoteRequest = vi.fn();

vi.mock('../lib/sidebar-api.js', () => ({
  createNoteRequest: (...args) => createNoteRequest(...args),
}));

beforeEach(() => {
  locale.set('en');
  createNoteRequest.mockReset();
});

test('заметка без названия создаётся сразу, кнопка работает с пустым полем', async () => {
  createNoteRequest.mockResolvedValue({ path: 'notes/Untitled.md', name: 'Untitled.md', isDir: false });
  const onCreated = vi.fn();
  render(CreateNoteModal, { open: true, onCreated });

  const create = screen.getByRole('button', { name: uiText.sidebar.modals.create });
  expect(create.disabled).toBe(false);
  await fireEvent.click(create);

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/Untitled.md' }), uiText.sidebar.untitledNote));
  expect(createNoteRequest).toHaveBeenCalledWith(expect.objectContaining({ title: uiText.sidebar.untitledNote }));
});

test('если «Untitled» занято, берётся следующее свободное имя', async () => {
  createNoteRequest
    .mockRejectedValueOnce(new ApiError(409, { detail: 'taken' }, 'taken'))
    .mockResolvedValueOnce({ path: 'notes/Untitled 2.md', name: 'Untitled 2.md', isDir: false });
  const onCreated = vi.fn();
  render(CreateNoteModal, { open: true, onCreated });

  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.create }));

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/Untitled 2.md' }), `${uiText.sidebar.untitledNote} 2`));
});
