import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, test, expect, vi } from 'vitest';
import OutlinePanel from './OutlinePanel.svelte';
import { locale, uiText } from '../lib/strings.js';

const NOTE = [
  '---',
  'title: Поиск',
  '---',
  '',
  '# Полнотекстовый поиск',
  '',
  'Текст.',
  '',
  '## Операторы',
  '',
  'Ещё текст.',
  '',
  '### Уровень три',
  '',
  '## Производительность',
].join('\n');

let events;

beforeEach(() => {
  events = [];
  locale.set('en');
});

test('стрелка на десктопе отправляет hide, а свёрнутая панель прячется на lg', async () => {
  const { component } = render(OutlinePanel, { content: NOTE });
  const hide = vi.fn();
  component.$on('hide', hide);

  await fireEvent.click(screen.getByRole('button', { name: uiText.editor.hideOutline }));
  expect(hide).toHaveBeenCalledTimes(1);
});

test('свёрнутое оглавление остаётся в DOM и прячется только на десктопе', () => {
  render(OutlinePanel, { content: NOTE, collapsed: true });
  expect(screen.getByTestId('outline-panel').className).toContain('lg:hidden');
  expect(screen.getAllByTestId('outline-item').length).toBeGreaterThan(0);
});

/** Рендер панели с подпиской на navigate — событие летит из компонента. */
function mount() {
  const result = render(OutlinePanel, { content: NOTE });
  result.component.$on('navigate', (e) => events.push(e.detail));
  return result;
}

test('оглавление показывает заголовки заметки', async () => {
  mount();
  const items = screen.getAllByTestId('outline-item').map((el) => el.textContent.trim());
  expect(items).toEqual(['Полнотекстовый поиск', 'Операторы', 'Уровень три', 'Производительность']);
});

test('клик по пункту отдаёт родителю текст заголовка, а не только якорь', async () => {
  mount();
  const items = screen.getAllByTestId('outline-item');

  await fireEvent.click(items[1]);

  // Родитель прокручивает редактор по тексту заголовка: без text он выходил
  // по раннему return, и клик не делал ровно ничего.
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual({ anchor: 'операторы', text: 'Операторы', occurrence: 0 });
});

test('клик по второму одинаковому заголовку отдаёт номер повтора', async () => {
  const repeated = '# Note\n\n## Summary\n\nA\n\n## Details\n\nB\n\n## Summary\n\nC';
  const { component } = render(OutlinePanel, { content: repeated });
  component.$on('navigate', (e) => events.push(e.detail));

  const summaries = screen.getAllByTestId('outline-item').filter((el) => el.textContent.trim() === 'Summary');
  await fireEvent.click(summaries[1]);

  expect(events).toEqual([{ anchor: 'summary-1', text: 'Summary', occurrence: 1 }]);
});

test('клик по каждому пункту даёт собственный текст', async () => {
  mount();
  const items = screen.getAllByTestId('outline-item');

  for (const item of items) await fireEvent.click(item);

  expect(events.map((e) => e.text)).toEqual([
    'Полнотекстовый поиск',
    'Операторы',
    'Уровень три',
    'Производительность',
  ]);
});