import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import CommandPalette from './CommandPalette.svelte';
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
  localStorage.setItem('pinnedNotes', JSON.stringify([
    { path: 'notes/Work/Alpha.md', name: 'Alpha Note' },
  ]));
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
