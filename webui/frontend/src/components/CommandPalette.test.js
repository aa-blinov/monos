import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import CommandPalette from './CommandPalette.svelte';
import { pinnedNotes } from '../lib/sidebar-pinned.js';
import { locale, translations, uiText } from '../lib/strings.js';

vi.mock('../lib/sidebar-api.js', () => ({
  loadTreeData: vi.fn(async () => ({
    path: 'notes',
    name: 'notes',
    is_dir: true,
    children: [
      {
        path: 'notes/Work/Alpha.md',
        name: 'Alpha.md',
        is_dir: false,
        children: [],
        metadata: { title: 'Alpha Note' },
      },
      {
        path: 'notes/Research.md',
        name: 'Research.md',
        is_dir: false,
        children: [],
        metadata: { title: 'Research' },
      },
    ],
  })),
  loadRecentNotesRequest: vi.fn(async () => [
    { path: 'notes/Research.md', name: 'Research.md' },
  ]),
}));

beforeEach(() => {
  locale.set('en');
  localStorage.clear();
  // Закрепления больше не живут в браузере — палитра берёт их из стора,
  // который наполняется шапками заметок.
  pinnedNotes.set([{ path: 'notes/Work/Alpha.md', name: 'Alpha Note' }]);
});

afterEach(() => {
  pinnedNotes.set([]);
});

test('CommandPalette показывает Pinned, Recent и Templates', async () => {
  const { component } = render(CommandPalette, { open: true, mode: 'commands' });
  const openNoteHandler = vi.fn();
  const commandHandler = vi.fn();
  component.$on('openNote', openNoteHandler);
  component.$on('command', commandHandler);

  await waitFor(() => expect(screen.getByText(uiText.commandPalette.sections.pinned)).toBeTruthy());
  await waitFor(() => expect(screen.getByText(uiText.commandPalette.sections.recent)).toBeTruthy());
  expect(screen.getByText(uiText.commandPalette.sections.templates)).toBeTruthy();

  await fireEvent.click(screen.getByText('Alpha Note'));
  expect(openNoteHandler).toHaveBeenCalledWith(expect.objectContaining({
    detail: { path: 'notes/Work/Alpha.md', name: 'Alpha Note', isDir: false },
  }));

  await component.$set({ open: true, mode: 'commands' });
  await fireEvent.input(screen.getByPlaceholderText(uiText.commandPalette.placeholder), {
    target: { value: 'meeting' },
  });
  await fireEvent.click(await screen.findByText('Meeting Notes'));
  expect(commandHandler.mock.calls[0][0].detail).toEqual({ id: 'openTemplate', templateId: 'meeting-note' });
});

test('Pinned и Recent сужаются по вводу, даже если загрузились до него', async () => {
  render(CommandPalette, { open: true, mode: 'notes' });
  // The Recent header only renders once its items are loaded: type after that.
  await waitFor(() => expect(screen.getByText(uiText.commandPalette.sections.recent)).toBeTruthy());
  await waitFor(() => expect(screen.queryAllByText(/Alpha Note/).length).toBeGreaterThan(0));

  const input = screen.getByPlaceholderText(uiText.commandPalette.quickSwitcherPlaceholder);
  await fireEvent.input(input, { target: { value: 'path:NONEXISTENT_XYZ' } });

  expect(screen.queryAllByText(/Alpha Note/)).toHaveLength(0);
  expect(screen.queryAllByText(/Research/)).toHaveLength(0);
});

test('CommandPalette показывает шаблоны на русском языке', async () => {
  locale.set('ru');
  const ruText = translations.ru;
  const { component } = render(CommandPalette, { open: true, mode: 'commands' });
  const commandHandler = vi.fn();
  component.$on('command', commandHandler);

  await waitFor(() => expect(screen.getByText(ruText.commandPalette.sections.templates)).toBeTruthy());
  expect(screen.getByText('Дневная заметка')).toBeTruthy();
  expect(screen.queryByText('Daily Note')).toBeNull();

  await fireEvent.input(screen.getByPlaceholderText(ruText.commandPalette.placeholder), {
    target: { value: 'пит' },
  });
  expect(await screen.findByText('План питания + покупки')).toBeTruthy();

  await fireEvent.input(screen.getByPlaceholderText(ruText.commandPalette.placeholder), {
    target: { value: 'встреч' },
  });
  await fireEvent.click(await screen.findByText('Заметка встречи'));
  expect(commandHandler.mock.calls[0][0].detail).toEqual({ id: 'openTemplate', templateId: 'meeting-note' });
});
