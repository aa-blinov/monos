import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import CreateNoteModal from './CreateNoteModal.svelte';
import { ApiError } from '../lib/api/client.js';
import { locale, uiText } from '../lib/strings.js';

const createNoteRequest = vi.fn();

const restoreNoteRequest = vi.fn();
const loadFileContent = vi.fn();

vi.mock('../lib/sidebar-api.js', () => ({
  createNoteRequest: (...args) => createNoteRequest(...args),
}));

vi.mock('../lib/editor-api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  restoreNoteRequest: (...args) => restoreNoteRequest(...args),
  loadFileContent: (...args) => loadFileContent(...args),
}));

beforeEach(() => {
  locale.set('en');
  createNoteRequest.mockReset();
  restoreNoteRequest.mockReset();
  loadFileContent.mockReset();
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

test('имя занято заметкой из корзины: диалог остаётся и предлагает восстановить или назвать иначе', async () => {
  createNoteRequest.mockRejectedValue(new ApiError(409, { detail: 'in trash', code: 'trashed', path: 'notes/Plan.md' }, 'in trash'));
  restoreNoteRequest.mockResolvedValue({ path: 'notes/Plan.md' });
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(CreateNoteModal, { open: true, onCreated, onClose });

  await fireEvent.input(screen.getByLabelText(uiText.sidebar.modals.title), { target: { value: 'Plan' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.create }));

  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(uiText.sidebar.errors.trashedNote));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: uiText.sidebar.modals.createAnotherName('Plan 2') })).toBeTruthy();

  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.restoreIt }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/Plan.md' }), 'Plan'));
  expect(restoreNoteRequest).toHaveBeenCalledWith('notes/Plan.md');
});

test('«Открыть существующую» на заметку из корзины (410) говорит об этом, а не закрывает окно', async () => {
  createNoteRequest.mockRejectedValue(new ApiError(409, { detail: 'taken', path: 'notes/Plan.md' }, 'taken'));
  loadFileContent.mockRejectedValue(new ApiError(410, { detail: 'trashed' }, 'gone'));
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(CreateNoteModal, { open: true, onCreated, onClose });

  await fireEvent.input(screen.getByLabelText(uiText.sidebar.modals.title), { target: { value: 'Plan' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.create }));
  await fireEvent.click(await screen.findByRole('button', { name: uiText.sidebar.modals.openExisting }));

  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(uiText.sidebar.errors.trashedNote));
  expect(onClose).not.toHaveBeenCalled();
  expect(onCreated).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: uiText.sidebar.modals.restoreIt })).toBeTruthy();
});

test('«Открыть существующую» открывает живую заметку как раньше', async () => {
  createNoteRequest.mockRejectedValue(new ApiError(409, { detail: 'taken', path: 'notes/Plan.md' }, 'taken'));
  loadFileContent.mockResolvedValue({ content: 'x' });
  const onCreated = vi.fn();
  render(CreateNoteModal, { open: true, onCreated });

  await fireEvent.input(screen.getByLabelText(uiText.sidebar.modals.title), { target: { value: 'Plan' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.create }));
  await fireEvent.click(await screen.findByRole('button', { name: uiText.sidebar.modals.openExisting }));

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes/Plan.md' }), 'Plan'));
});
