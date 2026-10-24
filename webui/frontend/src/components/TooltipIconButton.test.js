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

test('подсказка получает координаты и не выходит за правый край окна (кнопка у самого края)', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mock() {
    if (this.getAttribute('role') === 'tooltip') return rect(0, 0, 50, 35);
    if (this.tagName === 'BUTTON') return rect(856, 664, 28, 28);
    return rect(856, 664, 28, 28);
  });
  try {
    render(TooltipIconButton, { label: 'More', tooltip: 'Ещё', tooltipPosition: 'top', tooltipAlign: 'end' });
    await fireEvent.mouseEnter(screen.getByRole('button').parentElement);
    await vi.advanceTimersByTimeAsync(500);
    const style = screen.getByRole('tooltip').getAttribute('style') || '';
    // Without coordinates the box is drawn over the button and runs past the window edge (it did, 906 > 900).
    expect(style).toMatch(/left: \d+px/);
    const left = Number(style.match(/left: (\d+)px/)[1]);
    expect(left + 50).toBeLessThanOrEqual(900 - 12);
    expect(style).toMatch(/top: \d+px/);
  } finally {
    spy.mockRestore();
  }
});
