import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import QuickNoteSavedModal from './QuickNoteSavedModal.svelte';

const NOTE = { path: 'notes/Quick Notes/15-08-26-00-16-45.md', name: '15-08-26-00-16-45', isDir: false };

test('QuickNoteSavedModal рендерит input с текущим именем (без .md)', () => {
  render(QuickNoteSavedModal, { note: NOTE });
  const input = screen.getByTestId('quick-note-name-input');
  expect(input).toBeTruthy();
  expect(input.value).toBe('15-08-26-00-16-45');
  expect(input.tagName).toBe('INPUT');
  expect(input.type).toBe('text');
});

test('Input не disabled и не readonly — пользователь может ввести текст', () => {
  render(QuickNoteSavedModal, { note: NOTE });
  const input = screen.getByTestId('quick-note-name-input');
  expect(input.disabled).toBe(false);
  expect(input.readOnly).toBe(false);
  expect(input.getAttribute('tabindex')).not.toBe('-1');
  expect(input.getAttribute('aria-hidden')).not.toBe('true');
});

test('Пользователь может ввести новый текст в input', async () => {
  render(QuickNoteSavedModal, { note: NOTE });
  const input = screen.getByTestId('quick-note-name-input');
  input.focus();
  // fireEvent.input не обновляет input.value автоматически, нужно вручную
  input.value = 'My Renamed Note';
  await fireEvent.input(input);
  expect(input.value).toBe('My Renamed Note');
});

test('Кнопка Open диспатчит open с renameTo=null если имя не изменилось', async () => {
  const { component } = render(QuickNoteSavedModal, { note: NOTE });
  const openHandler = vi.fn();
  component.$on('open', openHandler);
  const button = screen.getByTestId('quick-note-open-button');
  await fireEvent.click(button);
  expect(openHandler).toHaveBeenCalledTimes(1);
  const detail = openHandler.mock.calls[0][0].detail;
  expect(detail.note).toEqual(NOTE);
  expect(detail.renameTo).toBeNull();
});

test('Кнопка Open диспатчит open с renameTo=новое-имя.md если имя изменилось', async () => {
  const { component } = render(QuickNoteSavedModal, { note: NOTE });
  const openHandler = vi.fn();
  component.$on('open', openHandler);
  const input = screen.getByTestId('quick-note-name-input');
  input.value = 'shopping list';
  await fireEvent.input(input);
  const button = screen.getByTestId('quick-note-open-button');
  await fireEvent.click(button);
  const detail = openHandler.mock.calls[0][0].detail;
  expect(detail.renameTo).toBe('shopping list.md');
  expect(detail.note).toEqual(NOTE);
});

test('Кнопка STAY HERE диспатчит close', async () => {
  const { component } = render(QuickNoteSavedModal, { note: NOTE });
  const closeHandler = vi.fn();
  component.$on('close', closeHandler);
  const buttons = screen.getAllByRole('button');
  const stayButton = buttons.find((b) => b.textContent && b.textContent.toLowerCase().includes('stay'));
  expect(stayButton).toBeTruthy();
  await fireEvent.click(stayButton);
  expect(closeHandler).toHaveBeenCalled();
});

test('Enter в input диспатчит open', async () => {
  const { component } = render(QuickNoteSavedModal, { note: NOTE });
  const openHandler = vi.fn();
  component.$on('open', openHandler);
  const input = screen.getByTestId('quick-note-name-input');
  input.focus();
  await fireEvent.keyDown(input, { key: 'Enter' });
  expect(openHandler).toHaveBeenCalled();
});

test('Ничего не рендерится если note = null', () => {
  const { container } = render(QuickNoteSavedModal, { note: null });
  expect(container.querySelector('[data-testid="quick-note-name-input"]')).toBeNull();
});
