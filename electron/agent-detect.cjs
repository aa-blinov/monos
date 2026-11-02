// Which agent commands this computer has. The page sends the names it knows; this module answers with the
// ones that resolve. The shell is asked first, because it reads the person's profile and sees what their own
// terminal sees (nvm, Homebrew, ~/.local/bin); an app started from the Dock has a bare PATH. The folders of PATH
// and a few usual homes of CLIs are checked as well, in case the shell is slow or is not a POSIX one.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const SAFE_COMMAND = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_COMMANDS = 64;
const SHELL_TIMEOUT_MS = 4000;
const MARK = 'MONOS_FOUND:';
const POSIX_SHELLS = new Set(['zsh', 'bash', 'sh', 'dash', 'ksh']);

/** Names that are safe to hand to a shell as words: the page's list is data, never a command. */
function safeCommands(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((item) => typeof item === 'string' && SAFE_COMMAND.test(item)))].slice(0, MAX_COMMANDS);
}

function candidateDirs(env, home, platform) {
  const sep = platform === 'win32' ? ';' : ':';
  const fromPath = String(env.PATH || env.Path || '').split(sep).filter(Boolean);
  const usual = platform === 'win32'
    ? [path.join(env.APPDATA || '', 'npm'), path.join(env.LOCALAPPDATA || '', 'Programs')]
    : [
        '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin',
        path.join(home, '.local/bin'), path.join(home, '.claude/local'), path.join(home, '.bun/bin'),
        path.join(home, '.cargo/bin'), path.join(home, '.npm-global/bin'), path.join(home, 'go/bin'),
      ];
  return [...new Set([...fromPath, ...usual])].filter((dir) => dir && !dir.startsWith('.'));
}

function findInDirs(commands, dirs, { platform, fsLike }) {
  const extensions = platform === 'win32' ? ['.exe', '.cmd', '.bat', '.ps1', ''] : [''];
  const found = [];
  for (const command of commands) {
    const hit = dirs.some((dir) => extensions.some((ext) => {
      try {
        const file = path.join(dir, command + ext);
        fsLike.accessSync(file, fsLike.constants.X_OK);
        return fsLike.statSync(file).isFile();
      } catch {
        return false;
      }
    }));
    if (hit) found.push(command);
  }
  return found;
}

function findViaShell(commands, { shell, env, exec, timeoutMs }) {
  return new Promise((resolve) => {
    if (!shell || !POSIX_SHELLS.has(path.basename(shell))) return resolve([]);
    const script = `for c in "$@"; do command -v "$c" >/dev/null 2>&1 && echo "${MARK}$c"; done`;
    // -i as well as -l: a PATH set up in .zshrc or .bashrc (nvm, pnpm) is what the terminal tab has.
    exec(shell, ['-l', '-i', '-c', script, 'monos-detect', ...commands], { env, timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      // A timed-out or failing shell still printed what it found before.
      const lines = String(stdout || '').split('\n');
      resolve(lines.filter((line) => line.startsWith(MARK)).map((line) => line.slice(MARK.length).trim()));
    });
  });
}

/**
 * @param {unknown} requested the commands the page asks about
 * @param {{ env?: object, shell?: string, platform?: string, home?: string, exec?: Function, fsLike?: object, timeoutMs?: number }} [options]
 * @returns {Promise<string[]>} the requested commands that exist here, in the order asked
 */
async function detectAgents(requested, options = {}) {
  const commands = safeCommands(requested);
  if (!commands.length) return [];
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const viaDirs = findInDirs(commands, candidateDirs(env, home, platform), { platform, fsLike: options.fsLike || fs });
  const viaShell = platform === 'win32'
    ? []
    : await findViaShell(commands, {
        shell: options.shell || env.SHELL,
        env,
        exec: options.exec || execFile,
        timeoutMs: options.timeoutMs || SHELL_TIMEOUT_MS,
      });
  const found = new Set([...viaDirs, ...viaShell]);
  return commands.filter((command) => found.has(command));
}

module.exports = { detectAgents, safeCommands, candidateDirs };
