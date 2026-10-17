import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The terminal is the person's own shell: an app started from inside a Claude Code session must not hand that
// session's markers to the agent launched here, or it takes itself for a sub-session and keeps no transcript.
test('терминал не наследует метки чужой сессии Claude Code, но хранит настройки человека', () => {
  const saved = { ...process.env };
  try {
    process.env.CLAUDECODE = '1';
    process.env.CLAUDE_CODE_CHILD_SESSION = '1';
    process.env.CLAUDE_CODE_ENTRYPOINT = 'cli';
    process.env.CLAUDE_CONFIG_DIR = '/home/me/.claude-work';
    process.env.ELECTRON_RUN_AS_NODE = '1';
    const { shellEnv } = require('../../electron/terminal.cjs');
    const env = shellEnv();
    assert.equal(env.CLAUDECODE, undefined);
    assert.equal(env.CLAUDE_CODE_CHILD_SESSION, undefined);
    assert.equal(env.CLAUDE_CODE_ENTRYPOINT, undefined);
    assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
    assert.equal(env.CLAUDE_CONFIG_DIR, '/home/me/.claude-work');
    assert.equal(env.TERM_PROGRAM, 'Monos');
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
