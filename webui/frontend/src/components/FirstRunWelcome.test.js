import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import { translations } from '../lib/strings.js';
import FirstRunWelcome from './FirstRunWelcome.svelte';

const text = translations.en.app.welcome;

test('первый запуск: три пути, и каждый ведёт туда, где это делается', async () => {
  const { component } = render(FirstRunWelcome, { terminal: true });
  const events = {};
  for (const name of ['newNote', 'chooseFolder', 'importArchive', 'connectSync', 'openHelp']) {
    events[name] = vi.fn();
    component.$on(name, events[name]);
  }
  expect(screen.getByRole('heading', { name: text.title })).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: text.writeAction }));
  await fireEvent.click(screen.getByRole('button', { name: text.folderAction }));
  await fireEvent.click(screen.getByRole('button', { name: text.importAction }));
  await fireEvent.click(screen.getByRole('button', { name: text.syncAction }));
  await fireEvent.click(screen.getByRole('button', { name: text.help }));
  for (const fn of Object.values(events)) expect(fn).toHaveBeenCalledTimes(1);
  expect(screen.getByText(text.tipAgent)).toBeTruthy();
});

test('телефон, открывший заметки компьютера: только «начать писать», без папки, GitHub и терминала', () => {
  render(FirstRunWelcome, { thisComputer: false, mobile: true });
  expect(screen.getByRole('button', { name: text.writeAction })).toBeTruthy();
  expect(screen.queryByRole('button', { name: text.folderAction })).toBeNull();
  expect(screen.queryByRole('button', { name: text.syncAction })).toBeNull();
  expect(screen.queryByText(text.tipAgent)).toBeNull();
});
