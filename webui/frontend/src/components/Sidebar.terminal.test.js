import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, expect, test, vi } from 'vitest';

// The terminal exists only in the desktop app: the preload gives the window `monosTerminal`, and the sidebar
// asks for the switch only then. This file keeps that bridge, so the other sidebar tests stay browser-like.
window.monosTerminal = { create: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() };

const { default: Sidebar } = await import('./Sidebar.svelte');
const { locale } = await import('../lib/strings.js');
const { terminalOpen } = await import('../lib/terminal.js');

const jsonResponse = (data) => ({ ok: true, status: 200, async json() { return data; } });

// The sidebar loads the tree and the lists at its foot as it mounts; the switch is not waiting for them.
beforeEach(() => {
  locale.set('en');
  terminalOpen.set(false);
  globalThis.fetch = vi.fn(async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/api/tree')) return jsonResponse({ path: 'notes', name: 'notes', is_dir: true, children: [] });
    if (url.startsWith('/api/directories')) return jsonResponse([]);
    if (url.startsWith('/api/tags')) return jsonResponse([]);
    if (url.startsWith('/api/saved-searches')) return jsonResponse([]);
    if (url.startsWith('/api/notes/table')) return jsonResponse({ rows: [] });
    return jsonResponse({});
  });
});

test('Sidebar держит переключатель терминала внизу, рядом со справкой и настройками', async () => {
  render(Sidebar);

  const button = await screen.findByTestId('sidebar-terminal');
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(button.textContent.trim()).toBe('Terminal');
  expect(button.className).toContain('text-[var(--text-secondary)]');

  await fireEvent.click(button);
  expect(get(terminalOpen)).toBe(true);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.className).toContain('text-[var(--text-primary)]');

  await fireEvent.click(button);
  expect(get(terminalOpen)).toBe(false);
});

test('Sidebar в телефонной раскладке кладёт терминал в сетку инструментов и закрывает панель', async () => {
  const { component } = render(Sidebar, { mobile: true });
  const closeHandler = vi.fn();
  component.$on('toggleSidebar', closeHandler);

  const button = screen.getByTestId('phone-terminal');
  await fireEvent.click(button);

  expect(get(terminalOpen)).toBe(true);
  expect(closeHandler).toHaveBeenCalledTimes(1);
});
