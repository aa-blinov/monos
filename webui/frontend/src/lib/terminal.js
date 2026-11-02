import { writable } from 'svelte/store';
import { askStyle } from './agents.js';

/**
 * The agent terminal. It exists only in the desktop app: the preload gives the window `monosTerminal`,
 * and a browser or a phone that opens the notes over Wi-Fi has none, so they never show the panel.
 */
export const terminalBridge = typeof window !== 'undefined' ? window.monosTerminal || null : null;

export const terminalOpen = writable(false);

/** A note path clicked in the terminal's output (`notes/…`); the app opens it. */
export const noteLinkRequest = writable(null);

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

/** A height read back from storage: a positive number of pixels, or NaN when none was kept. */
export function storedTerminalHeight(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return NaN;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : NaN;
}

/**
 * The panel's height, kept between launches; within reason for the window it is shown in. Until it is dragged,
 * it takes 45% of the window (never under 320px): an agent needs room for its answer and the prompt below it.
 */
export function clampTerminalHeight(value, viewportHeight) {
  const max = Math.max(160, Math.round(viewportHeight * 0.8));
  const height = Number(value);
  if (!Number.isFinite(height)) return Math.min(Math.max(320, Math.round(viewportHeight * 0.45)), max);
  return Math.min(max, Math.max(140, Math.round(height)));
}

// The catalogue lives in agents.js; these names stay for the code that imported them from here.
export { AGENTS as AGENT_PRESETS, DEFAULT_AGENT_COMMAND, agentLabel } from './agents.js';

/** A request for the terminal panel: start the agent, or ask it about a note. */
export const agentRequest = writable(null);

/**
 * The folder a note lives in, relative to the notes folder (`notes/Work/Plans/Plan.md` gives `Work/Plans`; a note
 * at the top, or no note, gives ''). An agent started from a note works in this folder.
 */
export function noteFolder(notePath) {
  const parts = String(notePath || '').replace(/^notes\//, '').split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

/** Start the agent where the person is: in the open note's folder, or in the notes folder from the board. */
export function launchAgent(notePath = '', command = '') {
  if (!terminalBridge) return;
  agentRequest.set({ kind: 'launch', folder: noteFolder(notePath), command, at: Date.now() });
}

export function askAgentAboutNote(notePath) {
  if (!terminalBridge || !notePath) return;
  agentRequest.set({ kind: 'ask', notePath, folder: noteFolder(notePath), at: Date.now() });
}

const SHELLS = new Set(['zsh', 'bash', 'sh', 'fish', 'dash', 'ksh', 'tcsh', 'csh', 'nu', 'pwsh', 'powershell', 'powershell.exe', 'pwsh.exe', 'cmd', 'cmd.exe']);

/** Whether the shell itself is in the foreground (and not a program started in it, such as the agent). */
export function shellInForeground(info) {
  if (!info?.process) return true;
  const name = String(info.process).toLowerCase();
  return name === String(info.shell || '').toLowerCase() || SHELLS.has(name) || SHELLS.has(name.replace(/^-/, ''));
}

/** Text in double quotes for a POSIX shell: `"`, `\`, `$` and backquote are escaped. */
export function shellDoubleQuote(text) {
  return `"${String(text).replace(/(["\\$`])/g, '\\$1')}"`;
}

/**
 * What "Ask the agent about this note" types. The note is named by its path inside the notes folder (the
 * terminal's working directory), in words every agent understands; the person writes the question after it.
 *
 * @param {string} notePath app path, `notes/Work/Plan.md`
 * @param {(path: string) => string} sentence the localized lead-in, given the path
 * @returns {{ prompt: string, takesQuestion: (command: string) => boolean, commandLine: (command: string) => string }}
 */
export function noteQuestion(notePath, sentence) {
  const relative = String(notePath || '').replace(/^notes\//, '');
  const prompt = sentence(relative);
  return {
    prompt,
    // An agent that cannot be given a question on its command line is only started.
    takesQuestion: (command) => askStyle(command).supported,
    // The cursor is left before the closing quote (one step left), inside the question.
    commandLine: (command) => {
      const { supported, flag } = askStyle(command);
      return supported ? `${command}${flag ? ` ${flag}` : ''} ${shellDoubleQuote(prompt)}` : command;
    },
  };
}
