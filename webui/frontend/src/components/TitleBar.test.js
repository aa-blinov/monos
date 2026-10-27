import fs from 'node:fs';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  cleanup();
  delete window.monosWindow;
  vi.resetModules();
});

async function mount(bridge, props = { title: 'CV — Monos' }) {
  if (bridge) window.monosWindow = bridge;
  const { default: TitleBar } = await import('./TitleBar.svelte');
  return render(TitleBar, props);
}

test('в браузере полосы нет', async () => {
  await mount(null);
  expect(screen.queryByTestId('title-bar')).toBeNull();
});

test('на Linux окно держит рамку системы, полосы нет', async () => {
  await mount({ platform: 'linux', customTitleBar: false });
  expect(screen.queryByTestId('title-bar')).toBeNull();
});

test('на macOS полоса называет окно и оставляет место светофору', async () => {
  await mount({ platform: 'darwin', customTitleBar: true, onFullScreen: () => () => {} });
  const bar = screen.getByTestId('title-bar');
  expect(bar.dataset.platform).toBe('darwin');
  expect(bar.textContent).toContain('CV — Monos');
});

test('на Windows цвет кнопок системы берётся у самой полосы', async () => {
  const setTitleBarColors = vi.fn();
  await mount({ platform: 'win32', customTitleBar: true, setTitleBarColors, onFullScreen: () => () => {} });
  expect(screen.getByTestId('title-bar').dataset.platform).toBe('win32');
  expect(setTitleBarColors).toHaveBeenCalledTimes(1);
  const colors = setTitleBarColors.mock.calls[0][0];
  expect(Object.keys(colors).sort()).toEqual(['color', 'symbolColor']);
});

test('полоса сама тянет окно, а мест для кликов в ней нет', async () => {
  const source = fs.readFileSync('src/components/TitleBar.svelte', 'utf8');
  expect(source).toContain('-webkit-app-region: drag');
  expect(source).not.toContain('<button');
});
