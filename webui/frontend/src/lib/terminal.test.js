import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTerminalHeight, storedTerminalHeight, terminalTheme } from './terminal.js';

test('цвета терминала берутся из темы, недостающие — нейтральные', () => {
  const vars = { '--bg-primary': '#282828', '--text-primary': '#ebdbb2', '--red': '#fb4934', '--blue': ' #83a598 ' };
  const theme = terminalTheme((name) => vars[name] || '');
  assert.equal(theme.background, '#282828');
  assert.equal(theme.foreground, '#ebdbb2');
  assert.equal(theme.red, '#fb4934');
  assert.equal(theme.blue, '#83a598');
  assert.equal(theme.cursor, '#ebdbb2');
  assert.match(theme.green, /^#/);
  assert.equal(theme.selectionBackground, '#ebdbb240');
});

test('высота панели в разумных пределах', () => {
  assert.equal(clampTerminalHeight(undefined, 900), 405);
  assert.equal(clampTerminalHeight(undefined, 600), 320);
  assert.equal(clampTerminalHeight(undefined, 300), 240);
  assert.equal(clampTerminalHeight(50, 900), 140);
  assert.equal(clampTerminalHeight(5000, 900), 720);
  assert.equal(clampTerminalHeight(400, 900), 400);
});

import { agentLabel, noteQuestion, shellDoubleQuote, shellInForeground } from './terminal.js';

test('оболочка или программа на переднем плане', () => {
  assert.equal(shellInForeground({ process: 'zsh', shell: 'zsh' }), true);
  assert.equal(shellInForeground({ process: '-zsh', shell: 'zsh' }), true);
  assert.equal(shellInForeground({ process: 'claude', shell: 'zsh' }), false);
  assert.equal(shellInForeground({ process: 'node', shell: 'bash' }), false);
  assert.equal(shellInForeground(null), true);
});

test('вопрос о заметке: путь внутри папки, кавычки и спецсимволы экранированы', () => {
  const question = noteQuestion('notes/Работа/План "Q4" $5.md', (p) => `Заметка: ${p}. `);
  assert.equal(question.prompt, 'Заметка: Работа/План "Q4" $5.md. ');
  assert.equal(question.commandLine('claude'), 'claude "Заметка: Работа/План \\"Q4\\" \\$5.md. "');
  assert.equal(shellDoubleQuote('a`b\\c'), '"a\\`b\\\\c"');
});

test('название агента по команде', () => {
  assert.equal(agentLabel('codex'), 'Codex');
  assert.equal(agentLabel('aider --model x'), 'aider --model x');
  assert.equal(agentLabel(''), 'Claude Code');
});

test('ничего не сохранено — высота по умолчанию, а не минимальная', () => {
  assert.ok(Number.isNaN(storedTerminalHeight(null)));
  assert.ok(Number.isNaN(storedTerminalHeight('')));
  assert.ok(Number.isNaN(storedTerminalHeight('0')));
  assert.ok(Number.isNaN(storedTerminalHeight('abc')));
  assert.equal(storedTerminalHeight('420'), 420);
  assert.equal(clampTerminalHeight(storedTerminalHeight(null), 900), 405);
});

test('OpenCode среди агентов в настройках, и его команда узнаётся по названию', async () => {
  const { AGENT_PRESETS, agentLabel } = await import('./terminal.js');
  assert.ok(AGENT_PRESETS.some((preset) => preset.id === 'opencode' && preset.command === 'opencode'));
  assert.equal(agentLabel('opencode'), 'OpenCode');
  assert.equal(agentLabel(' claude '), 'Claude Code');
});

// Each agent is given its first question the way its own documentation says: Claude Code, Codex and Gemini CLI
// take it as the argument; OpenCode's argument is a folder, so its question goes after --prompt.
test('вопрос агенту набирается так, как принимает каждый агент', async () => {
  const { noteQuestion } = await import('./terminal.js');
  const line = (command) => noteQuestion('notes/Work/План.md', (path) => `Про заметку ${path}: `).commandLine(command);
  assert.equal(line('claude'), 'claude "Про заметку Work/План.md: "');
  assert.equal(line('codex'), 'codex "Про заметку Work/План.md: "');
  assert.equal(line('gemini'), 'gemini "Про заметку Work/План.md: "');
  assert.equal(line('opencode'), 'opencode --prompt "Про заметку Work/План.md: "');
  assert.equal(line('/opt/homebrew/bin/opencode --model x/y'), '/opt/homebrew/bin/opencode --model x/y --prompt "Про заметку Work/План.md: "');
  assert.equal(line('opencode --prompt'), 'opencode --prompt "Про заметку Work/План.md: "', 'a flag already there is not doubled');
  assert.equal(line('my-opencode-wrapper'), 'my-opencode-wrapper "Про заметку Work/План.md: "', 'only the opencode command itself');
});

test('Cursor CLI — среди агентов в настройках, вопрос о заметке идёт аргументом', async () => {
  const { AGENT_PRESETS, agentLabel, noteQuestion } = await import('./terminal.js');
  assert.ok(AGENT_PRESETS.some((preset) => preset.id === 'cursor' && preset.command === 'cursor-agent'));
  assert.equal(agentLabel('cursor-agent'), 'Cursor CLI');
  const line = noteQuestion('notes/Work/План.md', (path) => `Про ${path}: `).commandLine('cursor-agent');
  assert.match(line, /^cursor-agent "Про /);
});
