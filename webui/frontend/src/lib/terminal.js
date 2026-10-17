import { writable } from 'svelte/store';

/**
 * The agent terminal. It exists only in the desktop app: the preload gives the window `monosTerminal`,
 * and a browser or a phone that opens the notes over Wi-Fi has none, so they never show the panel.
 */
export const terminalBridge = typeof window !== 'undefined' ? window.monosTerminal || null : null;

export const terminalOpen = writable(false);

export function toggleTerminal() {
  if (terminalBridge) terminalOpen.update((open) => !open);
}

/**
 * xterm's colours from the theme's own, so the terminal sits in the page instead of being a black box.
 * `read(name)` returns a CSS variable's value; a theme without one of them falls back to a neutral colour.
 *
 * @param {(name: string) => string} read
 */
export function terminalTheme(read) {
  const value = (name, fallback) => (String(read(name) || '').trim() || fallback);
  const foreground = value('--text-primary', '#d4d4d4');
  const background = value('--bg-primary', '#1e1e1e');
  const red = value('--red', '#cc6666');
  const green = value('--green', '#b5bd68');
  const yellow = value('--yellow', '#f0c674');
  const blue = value('--blue', '#81a2be');
  const purple = value('--purple', '#b294bb');
  const aqua = value('--aqua', '#8abeb7');
  const muted = value('--text-tertiary', '#808080');
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    // xterm parses colours itself: hex with alpha, not color-mix().
    selectionBackground: /^#[0-9a-f]{6}$/i.test(foreground) ? `${foreground}40` : 'rgba(128, 128, 128, 0.3)',
    black: value('--bg-tertiary', '#333333'),
    red,
    green,
    yellow,
    blue,
    magenta: purple,
    cyan: aqua,
    white: value('--text-secondary', '#bbbbbb'),
    brightBlack: muted,
    brightRed: red,
    brightGreen: green,
    brightYellow: yellow,
    brightBlue: blue,
    brightMagenta: purple,
    brightCyan: aqua,
    brightWhite: foreground,
  };
}

/** The panel's height, kept between launches; within reason for the window it is shown in. */
export function clampTerminalHeight(value, viewportHeight) {
  const max = Math.max(160, Math.round(viewportHeight * 0.8));
  const height = Number(value);
  if (!Number.isFinite(height)) return Math.min(320, max);
  return Math.min(max, Math.max(140, Math.round(height)));
}
