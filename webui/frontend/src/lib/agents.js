import { get, writable } from 'svelte/store';

/**
 * The coding agents Monos knows by name. `command` is what is typed in the terminal; `ask` says how the agent
 * is given its first question: as the argument (`claude "…"`), after a flag, or not at all (it is only started).
 * An agent that is not sure to take a question on its command line is left at `null`: a guessed argument would be
 * read as a file name or a subcommand.
 */
export const AGENTS = [
  { id: 'claude', label: 'Claude Code', command: 'claude', ask: '' },
  { id: 'codex', label: 'Codex', command: 'codex', ask: '' },
  { id: 'gemini', label: 'Gemini CLI', command: 'gemini', ask: '' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', ask: '--prompt' },
  // Cursor's command-line agent; it takes the first question as the argument, like Claude Code.
  { id: 'cursor', label: 'Cursor CLI', command: 'cursor-agent', ask: '' },
  { id: 'copilot', label: 'GitHub Copilot', command: 'copilot', ask: '-i' },
  { id: 'qwen', label: 'Qwen Code', command: 'qwen', ask: '' },
  { id: 'droid', label: 'Droid', command: 'droid', ask: '' },
  { id: 'auggie', label: 'Auggie', command: 'auggie', ask: '' },
  { id: 'vibe', label: 'Mistral Vibe', command: 'vibe', ask: '' },
  { id: 'cline', label: 'Cline', command: 'cline', ask: '' },
  { id: 'aider', label: 'Aider', command: 'aider', ask: null },
  { id: 'goose', label: 'Goose', command: 'goose', ask: null },
  { id: 'amp', label: 'Amp', command: 'amp', ask: null },
  { id: 'crush', label: 'Crush', command: 'crush', ask: null },
  { id: 'kiro', label: 'Kiro', command: 'kiro-cli', ask: null },
  { id: 'kilo', label: 'Kilo Code', command: 'kilocode', ask: null },
  { id: 'grok', label: 'Grok', command: 'grok', ask: null },
  { id: 'junie', label: 'Junie', command: 'junie', ask: null },
  { id: 'codebuff', label: 'Codebuff', command: 'codebuff', ask: null },
  { id: 'openhands', label: 'OpenHands', command: 'openhands', ask: null },
];
export const DEFAULT_AGENT_COMMAND = 'claude';

/** The first word of a command line without its folder: `/opt/bin/opencode --model x` gives `opencode`. */
export function commandWord(command) {
  const first = String(command || '').trim().split(/\s+/)[0] || '';
  return first.split(/[\\/]/).pop().replace(/\.(?:exe|cmd|bat)$/i, '');
}

/** The known agent a command line starts, or null for a command of the person's own. */
export function agentForCommand(command) {
  const word = commandWord(command);
  return word ? AGENTS.find((agent) => agent.command === word) || null : null;
}

export function agentLabel(command) {
  const text = String(command || '').trim();
  const exact = AGENTS.find((agent) => agent.command === text);
  if (exact) return exact.label;
  return text || 'Claude Code';
}

/**
 * How the agent behind a command is given its first question: `{ supported, flag }`. A command of the person's
 * own is assumed to take it as the argument; a flag the person already typed is not doubled.
 */
export function askStyle(command) {
  const agent = agentForCommand(command);
  if (!agent) return { supported: true, flag: '' };
  if (agent.ask === null) return { supported: false, flag: '' };
  const flag = agent.ask;
  const typed = flag && String(command).split(/\s+/).includes(flag);
  return { supported: true, flag: typed ? '' : flag };
}

/** The command that starts the agent from the terminal; what is saved in Settings. */
export const agentCommand = writable(DEFAULT_AGENT_COMMAND);

/** Commands found on this computer (a list), or null while not asked, or in a browser that cannot ask. */
export const installedCommands = writable(null);

let settingsLoaded = false;

/** Reads the chosen agent from the settings once; later calls with `force` read it again (the settings window may have changed it). */
export async function loadAgentCommand(force = false) {
  if (settingsLoaded && !force) return get(agentCommand);
  try {
    const settings = await (await fetch('/api/settings')).json();
    agentCommand.set(String(settings?.agent_command || '').trim() || DEFAULT_AGENT_COMMAND);
    settingsLoaded = true;
  } catch { /* the default stays */ }
  return get(agentCommand);
}

export async function saveAgentCommand(command) {
  const value = String(command || '').trim();
  if (!value) return;
  agentCommand.set(value);
  settingsLoaded = true;
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_command: value }),
  });
}

/**
 * Asks the shell of the desktop app which of the known agents are on this computer. The answer is the commands
 * found (also kept in `installedCommands`); without the bridge there is nobody to ask and the list stays null.
 */
export async function detectInstalledAgents() {
  const bridge = typeof window !== 'undefined' ? window.monosTerminal : null;
  if (!bridge?.detectAgents) return null;
  try {
    const found = await bridge.detectAgents(AGENTS.map((agent) => agent.command));
    const list = Array.isArray(found) ? found.map(String) : [];
    installedCommands.set(list);
    return list;
  } catch {
    return null;
  }
}

/** The known agents found on this computer, in the catalogue's order. */
export function installedAgents(found) {
  const set = new Set(found || []);
  return AGENTS.filter((agent) => set.has(agent.command));
}
