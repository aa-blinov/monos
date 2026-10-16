import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import ConflictNoteView from './ConflictNoteView.svelte';
import { locale, uiText } from '../lib/strings.js';

const content = 'Начало.\n\n<<<<<<< HEAD\nМоя версия.\n=======\nВерсия с телефона.\n>>>>>>> origin/master\n\nКонец.';

test('выбор для одной части запоминается, «Применить» включается и отдаёт выбор', async () => {
  locale.set('en');
  const { component } = render(ConflictNoteView, { content });
  const resolve = vi.fn();
  component.$on('resolve', resolve);

  const both = screen.getByRole('button', { name: uiText.editor.conflictKeepBoth });
  const applyButtons = () => screen.getAllByRole('button', { name: uiText.editor.conflictApply });
  expect(applyButtons().every((button) => button.disabled)).toBe(true);

  await fireEvent.click(both);
  expect(both.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText(uiText.editor.conflictChosen(1, 1))).toBeTruthy();
  expect(applyButtons().every((button) => !button.disabled)).toBe(true);

  await fireEvent.click(applyButtons().at(-1));
  expect(resolve.mock.calls[0][0].detail).toEqual({ choices: { 0: 'both' } });

  // The same side again takes the choice back.
  await fireEvent.click(both);
  expect(both.getAttribute('aria-pressed')).toBe('false');
});
