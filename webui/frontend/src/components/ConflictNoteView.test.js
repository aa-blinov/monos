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

test('версии названы устройствами, изменённые слова подсвечены, одна версия на всю заметку применяется сразу', async () => {
  locale.set('ru');
  const sides = { ours: { device: 'Ноутбук', date: new Date().toISOString() }, theirs: { device: 'Телефон', date: new Date().toISOString() } };
  const twoParts = '<<<<<<< HEAD\nВыезд: суббота, 9:00.\n=======\nВыезд: пятница, 6:30.\n>>>>>>> origin/master\n\nСередина.\n\n<<<<<<< HEAD\n- плед\n=======\n- термос\n>>>>>>> origin/master\n';
  const { component, container } = render(ConflictNoteView, { content: twoParts, sides });
  const resolve = vi.fn();
  component.$on('resolve', resolve);

  expect(screen.getAllByRole('button', { name: 'Оставить: Телефон' })).toHaveLength(2);
  expect(screen.getAllByTestId('conflict-ours-label')[0].textContent).toMatch(/Ноутбук \(это устройство\)/);
  expect(screen.getAllByText(/^Сегодня, \d\d:\d\d$/).length).toBeGreaterThan(0);
  const marks = [...container.querySelectorAll('mark')].map((mark) => mark.textContent);
  expect(marks).toContain('суббота, 9:00.');
  expect(marks).toContain('пятница, 6:30.');
  expect(marks).not.toContain('Выезд:');

  await fireEvent.click(screen.getByTestId('conflict-whole-theirs'));
  expect(resolve.mock.calls[0][0].detail).toEqual({ choices: { 0: 'theirs', 1: 'theirs' }, whole: true });
});

test('без сведений об устройствах версии называются по-простому', () => {
  locale.set('ru');
  render(ConflictNoteView, { content });
  expect(screen.getByRole('button', { name: 'Оставить: Это устройство' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Оставить: Другое устройство' })).toBeTruthy();
});

test('«Написать свою» открывает поле с текстом этого устройства и отдаёт написанное', async () => {
  locale.set('ru');
  const { component } = render(ConflictNoteView, { content });
  const resolve = vi.fn();
  component.$on('resolve', resolve);
  await fireEvent.click(screen.getByRole('button', { name: 'Написать свою' }));
  const field = screen.getByTestId('conflict-own-text');
  expect(field.value).toBe('Моя версия.');
  await fireEvent.input(field, { target: { value: 'Общая версия.' } });
  await fireEvent.click(screen.getAllByRole('button', { name: 'Применить' }).at(-1));
  expect(resolve.mock.calls[0][0].detail).toEqual({ choices: { 0: { custom: 'Общая версия.' } } });
});
