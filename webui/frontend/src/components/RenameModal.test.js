import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import RenameModal from './RenameModal.svelte';
import { locale, uiText } from '../lib/strings.js';

beforeEach(() => locale.set('en'));

test('a name held by a note in the Trash is explained, with a way to restore that note', async () => {
  const { component } = render(RenameModal, { currentName: 'Old.md', serverProblem: uiText.sidebar.errors.trashedName, canRestore: true });
  expect(screen.getByTestId('rename-problem').textContent).toContain('Trash');
  const restore = vi.fn();
  component.$on('restore', restore);
  await fireEvent.click(screen.getByTestId('restore-trashed-note'));
  expect(restore).toHaveBeenCalledTimes(1);
});

test('the reason goes away once the name is changed', async () => {
  const { container } = render(RenameModal, { currentName: 'Old.md', serverProblem: 'A reason', canRestore: true });
  const input = container.querySelector('#rename-input');
  await fireEvent.input(input, { target: { value: 'New.md' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.rename }));
  expect(screen.getByTestId('rename-problem')).toBeTruthy();
  await fireEvent.input(input, { target: { value: 'Other.md' } });
  expect(screen.queryByTestId('rename-problem')).toBeNull();
});
