import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, agentForCommand, agentLabel, askStyle, commandWord, installedAgents } from './agents.js';

test('в каталоге нет повторов по id и по команде, команда — одно слово', () => {
  assert.equal(new Set(AGENTS.map((agent) => agent.id)).size, AGENTS.length);
  assert.equal(new Set(AGENTS.map((agent) => agent.command)).size, AGENTS.length);
  for (const agent of AGENTS) assert.match(agent.command, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, agent.id);
});

test('агента узнают по первому слову команды, путь и расширение не мешают', () => {
  assert.equal(commandWord('/opt/homebrew/bin/opencode --model x'), 'opencode');
  assert.equal(commandWord('C:\\bin\\codex.cmd'), 'codex');
  assert.equal(agentForCommand('claude --resume').id, 'claude');
  assert.equal(agentForCommand('my-claude-wrapper'), null);
  assert.equal(agentForCommand(''), null);
});

test('подпись: известная команда — название агента, своя — как напечатана', () => {
  assert.equal(agentLabel('copilot'), 'GitHub Copilot');
  assert.equal(agentLabel('aider --model x'), 'aider --model x');
  assert.equal(agentLabel(' '), 'Claude Code');
});

test('вопрос агенту: аргументом, флагом, или агент только запускается', () => {
  assert.deepEqual(askStyle('claude'), { supported: true, flag: '' });
  assert.deepEqual(askStyle('opencode'), { supported: true, flag: '--prompt' });
  assert.deepEqual(askStyle('opencode --prompt'), { supported: true, flag: '' });
  assert.deepEqual(askStyle('copilot'), { supported: true, flag: '-i' });
  assert.deepEqual(askStyle('aider'), { supported: false, flag: '' });
  assert.deepEqual(askStyle('my-own-agent'), { supported: true, flag: '' });
});

test('найденные агенты идут в порядке каталога, чужие команды отбрасываются', () => {
  assert.deepEqual(installedAgents(['codex', 'nope', 'claude']).map((agent) => agent.id), ['claude', 'codex']);
  assert.deepEqual(installedAgents(null), []);
});
