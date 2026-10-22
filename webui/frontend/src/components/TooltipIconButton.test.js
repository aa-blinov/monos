import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import TooltipIconButton from './TooltipIconButton.svelte';

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
});
afterEach(() => { vi.useRealTimers(); });

test('при наведении подсказка ждёт, а не выскакивает от пролёта мыши', async () => {
  render(TooltipIconButton, { label: 'Notes table', tooltip: 'Every note with its own fields in one table.' });
  await fireEvent.mouseEnter(screen.getByRole('button').parentElement);
  expect(screen.queryByRole('tooltip')).toBeNull();
  await vi.advanceTimersByTimeAsync(500);
  expect(screen.getByRole('tooltip').textContent).toContain('Every note');
});

test('мышь ушла раньше — подсказка так и не появилась', async () => {
  render(TooltipIconButton, { label: 'Trash', tooltip: 'Trash' });
  const button = screen.getByRole('button');
  await fireEvent.mouseEnter(button.parentElement);
  await vi.advanceTimersByTimeAsync(200);
  await fireEvent.mouseLeave(button.parentElement);
  await vi.advanceTimersByTimeAsync(500);
  expect(screen.queryByRole('tooltip')).toBeNull();
});

test('фокус с клавиатуры показывает подсказку сразу; пустая не показывается никогда', async () => {
  const { component } = render(TooltipIconButton, { label: 'Close', tooltip: 'Close' });
  await fireEvent.focus(screen.getByRole('button'));
  expect(screen.getByRole('tooltip')).toBeTruthy();
  await component.$set({ tooltip: '' });
  await fireEvent.blur(screen.getByRole('button'));
  await fireEvent.mouseEnter(screen.getByRole('button').parentElement);
  await vi.advanceTimersByTimeAsync(600);
  expect(screen.queryByRole('tooltip')).toBeNull();
});
