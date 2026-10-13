import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, test, expect } from 'vitest';
import OutlinePanel from './OutlinePanel.svelte';

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
  expect(events[0]).toEqual({ anchor: 'операторы', text: 'Операторы' });
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