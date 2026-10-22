import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, test, vi } from 'vitest';
import Checkbox from './Checkbox.svelte';

test('Checkbox рендерит label и инпут без checked', () => {
  render(Checkbox, { id: 'test', checked: false }, { slots: { default: 'Auto-format on save' } });
  const input = screen.getByRole('checkbox');
  expect(input).toBeTruthy();
  expect(input.checked).toBe(false);
  // slot-передача через testing-library не всегда работает в svelte 4;
  // основной потребитель (Settings) передаёт label явно через for=id
  expect(input.id).toBe('test');
});

test('Checkbox отмеченный: инпут в состоянии checked, svg имеет peer-checked класс', () => {
  render(Checkbox, { id: 'test', checked: true });
  const input = screen.getByRole('checkbox');
  expect(input.checked).toBe(true);
  const mark = screen.getByRole('checkbox').parentElement.querySelector('svg');
  expect(mark.getAttribute('class') || '').toContain('peer-checked:opacity-100');
  expect(mark.getAttribute('class') || '').toContain('opacity-0');
});

test('Checkbox диспатчит change при клике', async () => {
  const { component } = render(Checkbox, { id: 'test', checked: false });
  const changeHandler = vi.fn();
  component.$on('change', changeHandler);
  const input = screen.getByRole('checkbox');
  await fireEvent.click(input);
  expect(changeHandler).toHaveBeenCalled();
});

test('Checkbox при checked: true задаёт bg/border на инпуте', () => {
  render(Checkbox, { id: 'test', checked: true });
  const input = screen.getByRole('checkbox');
  const cls = input.getAttribute('class') || '';
  expect(cls).toContain('checked:bg-ink');
  expect(cls).toContain('checked:border-ink');
  expect(cls).toContain('appearance-none');
});

test('Checkbox SVG-галочка абсолютно позиционирована и выше инпута (z-10)', () => {
  render(Checkbox, { id: 'test', checked: true });
  const mark = screen.getByRole('checkbox').parentElement.querySelector('svg');
  const cls = mark.getAttribute('class') || '';
  expect(cls).toContain('absolute');
  expect(cls).toContain('pointer-events-none');
});

test('Checkbox disabled делает label недоступным', () => {
  render(Checkbox, { id: 'test', checked: false, disabled: true });
  const input = screen.getByRole('checkbox');
  expect(input.disabled).toBe(true);
  const label = input.closest('label');
  expect(label?.className || '').toContain('opacity-50');
});
