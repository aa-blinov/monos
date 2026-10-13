import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import CategoryInput from './CategoryInput.svelte';

const SUGGESTIONS = [
  { name: 'Work', count: 12 },
  { name: 'Ideas', count: 5 },
  { name: 'Network', count: 2 },
];

let commits;

beforeEach(() => {
  commits = [];
});

function mount(props = {}) {
  const result = render(CategoryInput, {
    value: '',
    suggestions: SUGGESTIONS,
    label: 'Category',
    listLabel: 'Category suggestions',
    testid: 'category',
    ...props,
  });
  result.component.$on('commit', (event) => commits.push(event.detail));
  return { ...result, input: screen.getByRole('combobox', { name: 'Category' }) };
}

test('при фокусе показывает категории с числом заметок, при вводе фильтрует', async () => {
  const { input } = mount();
  await fireEvent.focus(input);
  expect(screen.getAllByRole('option').map((o) => o.textContent.trim())).toEqual(['Work 12', 'Ideas 5', 'Network 2']);

  await fireEvent.input(input, { target: { value: 'wo' } });
  expect(screen.getAllByRole('option').map((o) => o.textContent.trim())).toEqual(['Work 12', 'Network 2']);
});

test('стрелки выбирают вариант, Enter сохраняет его', async () => {
  const { input } = mount();
  await fireEvent.focus(input);

  await fireEvent.keyDown(input, { key: 'ArrowDown' });
  await fireEvent.keyDown(input, { key: 'ArrowDown' });
  await fireEvent.keyDown(input, { key: 'Enter' });

  expect(commits).toEqual(['Ideas']);
  expect(input.value).toBe('Ideas');
});

test('Enter без выбранного варианта сохраняет то, что введено, в каноническом написании', async () => {
  const { input } = mount();
  await fireEvent.focus(input);
  await fireEvent.input(input, { target: { value: '  work ' } });

  await fireEvent.keyDown(input, { key: 'Enter' });

  expect(commits).toEqual(['Work']);
});

test('клик мышью по варианту сохраняет его', async () => {
  const { input } = mount();
  await fireEvent.focus(input);

  await fireEvent.mouseDown(screen.getByRole('option', { name: /Network/ }));

  expect(commits).toEqual(['Network']);
  expect(input.value).toBe('Network');
});

test('первый Escape закрывает список, второй возвращает сохранённое значение', async () => {
  const { input } = mount({ value: 'Ideas' });
  await fireEvent.focus(input);
  await fireEvent.input(input, { target: { value: 'zzz' } });
  expect(screen.queryAllByRole('option')).toHaveLength(0);

  await fireEvent.input(input, { target: { value: 'w' } });
  expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  await fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryAllByRole('option')).toHaveLength(0);

  await fireEvent.keyDown(input, { key: 'Escape' });
  expect(input.value).toBe('Ideas');
  expect(commits).toEqual([]);
});

test('уход из поля сохраняет введённое, а очистка даёт пустую категорию', async () => {
  const { input } = mount({ value: 'Ideas' });
  await fireEvent.focus(input);
  await fireEvent.input(input, { target: { value: '' } });
  await fireEvent.blur(input);

  expect(commits).toEqual(['']);
});

test('без изменений ничего не сохраняется', async () => {
  const { input } = mount({ value: 'Work' });
  await fireEvent.focus(input);
  await fireEvent.blur(input);

  expect(commits).toEqual([]);
});

test('событие open уходит при фокусе, чтобы родитель подгрузил подсказки', async () => {
  const { component, input } = mount();
  const open = vi.fn();
  component.$on('open', open);

  await fireEvent.focus(input);

  expect(open).toHaveBeenCalledTimes(1);
});

test('фокус в поле с уже стоящим значением показывает все категории, фильтр только по вводу', async () => {
  const { input } = mount({ value: 'Ideas' });
  await fireEvent.focus(input);
  expect(screen.getAllByRole('option').map((o) => o.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Work 12', 'Ideas 5', 'Network 2']);

  await fireEvent.input(input, { target: { value: 'net' } });
  expect(screen.getAllByRole('option').map((o) => o.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Network 2']);
});
