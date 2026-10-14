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

test('занятое имя не перезаписывает заметку: причина показана, текст остаётся в поле', async () => {
  createNoteRequest.mockRejectedValue(new ApiError(409, { detail: 'taken', path: 'notes/Plan.md' }, 'taken'));
  const onCreated = vi.fn();
  render(CreateNoteModal, { open: true, onCreated });

  const input = screen.getByLabelText(uiText.sidebar.modals.title);
  await fireEvent.input(input, { target: { value: 'Plan' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.create }));

  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(uiText.sidebar.errors.duplicateNote));
  expect(onCreated).not.toHaveBeenCalled();
  expect(input.value).toBe('Plan');
});

test('дневная заметка, которая уже существует, открывается вместо ошибки', async () => {
  createNoteRequest.mockRejectedValue(new ApiError(409, { detail: 'taken', path: 'notes/Daily/today.md' }, 'taken'));
  const onCreated = vi.fn();
  render(CreateNoteModal, { open: true, onCreated });

  await fireEvent.click(screen.getByRole('button', { name: new RegExp(uiText.sidebar.modals.todayNote) }));

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'notes/Daily/today.md' }),
    expect.any(String),
  ));
  expect(screen.queryByRole('alert')).toBeNull();
});
