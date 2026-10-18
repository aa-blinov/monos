import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The assistants' guide to the notes folder: made when the server starts, never overwritten, never shown as a
// note, and valid as a skill (a name, a description that says when to use it).
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-skill-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });
fs.writeFileSync(path.join(notesDir, 'Plain.md'), '# Plain\n', 'utf-8');
process.env.NOTES_ROOT = tempRoot;
const { startServer, stopServer } = await import('./index.js');
const { ensureAgentSkill, excludeAgentSkillFromGit, SKILL_MD, AGENT_SKILL_PATH, agentSkillStatus } = await import('./agent-skill.js');
const { AGENTS_MD } = await import('./agent-rules.js');
let base;
const skillFile = path.join(notesDir, AGENT_SKILL_PATH);

test.before(async () => {
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
});
test.after(async () => { await stopServer(); });

test('навык создаётся при запуске сервера, без всякого запроса', () => {
  assert.ok(fs.existsSync(skillFile), skillFile);
  assert.equal(fs.readFileSync(skillFile, 'utf-8'), SKILL_MD);
  assert.equal(agentSkillStatus(), true);
  assert.equal(AGENT_SKILL_PATH, path.join('.claude', 'skills', 'monos-notes', 'SKILL.md'));
});

test('шапка навыка годится для загрузчика: имя папки, описание в кавычках, версия', () => {
  const match = SKILL_MD.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'front matter');
  const head = match[1];
  assert.match(head, /^name: monos-notes$/m);
  // A plain YAML scalar cannot hold ": "; the description has one, so it is quoted.
  assert.match(head, /^description: ".+"$/m);
  const description = head.match(/^description: "(.+)"$/m)[1];
  assert.ok(description.length > 80 && description.length < 1024, String(description.length));
  assert.match(description, /Use it whenever/);
  assert.match(head, /monos-skill-version: 1/);
});

test('навык не перезаписывается, даже если человек его правил', () => {
  fs.writeFileSync(skillFile, '---\nname: monos-notes\ndescription: "mine"\n---\nСвоё.\n', 'utf-8');
  assert.equal(ensureAgentSkill(), false);
  assert.match(fs.readFileSync(skillFile, 'utf-8'), /Своё\./);
  // Deleted, it comes back.
  fs.rmSync(path.dirname(skillFile), { recursive: true, force: true });
  assert.equal(ensureAgentSkill(), true);
  assert.equal(fs.readFileSync(skillFile, 'utf-8'), SKILL_MD);
});

test('навык не показывается как заметка: ни в дереве, ни в доске, ни в поиске', async () => {
  const tree = JSON.stringify(await (await fetch(`${base}/api/tree`)).json());
  assert.ok(!tree.includes('SKILL.md') && !tree.includes('.claude'));
  const recent = await (await fetch(`${base}/api/notes/recent?limit=50`)).json();
  assert.ok(recent.every((note) => !note.path.includes('.claude')));
  assert.ok(recent.some((note) => note.path.endsWith('Plain.md')));
  const search = await (await fetch(`${base}/api/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'Working with Monos notes', search_content: true }) })).json();
  const hits = Array.isArray(search) ? search : (search.results || []);
  assert.ok(hits.every((item) => !String(item.path || '').includes('.claude')));
});

test('навык говорит о том, что правда для Monos: имена, ссылки, вложения, чего не трогать', () => {
  for (const phrase of ['file name without', '[[Note|shown text]]', '_attachments/', 'monos-locked: true', '.monos/', 'aliases', 'tags: [work, ideas]', 'rename', 'Daily/', 'Quick Notes/', 'rg ']) {
    assert.ok(SKILL_MD.toLowerCase().includes(phrase.toLowerCase()), `в навыке нет «${phrase}»`);
  }
});

test('правила агента отправляют к навыку', () => {
  assert.ok(AGENTS_MD.includes('.claude/skills/monos-notes/SKILL.md'));
});

test('навык остаётся на своём компьютере: строка в .git/info/exclude, идемпотентно, без репозитория ничего не делает', () => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-excl-'));
  assert.equal(excludeAgentSkillFromGit(plain), false);
  assert.ok(!fs.existsSync(path.join(plain, '.git')));

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-excl-'));
  fs.mkdirSync(path.join(repo, '.git'));
  assert.equal(excludeAgentSkillFromGit(repo), true);
  const file = path.join(repo, '.git', 'info', 'exclude');
  assert.match(fs.readFileSync(file, 'utf-8'), /^\.claude\/skills\/monos-notes\/$/m);
  assert.equal(excludeAgentSkillFromGit(repo), false);
  assert.equal(fs.readFileSync(file, 'utf-8').match(/monos-notes/g).length, 1);

  // An existing exclude file keeps what it had, and a missing final newline does not glue two lines together.
  fs.writeFileSync(file, '# mine\n*.tmp', 'utf-8');
  assert.equal(excludeAgentSkillFromGit(repo), true);
  assert.equal(fs.readFileSync(file, 'utf-8'), '# mine\n*.tmp\n.claude/skills/monos-notes/\n');
});

test('git не видит навык: ни в статусе, ни при добавлении всего', async () => {
  const { execFileSync } = await import('node:child_process');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-excl-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  excludeAgentSkillFromGit(repo);
  fs.mkdirSync(path.join(repo, '.claude', 'skills', 'monos-notes'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'skills', 'monos-notes', 'SKILL.md'), SKILL_MD, 'utf-8');
  fs.writeFileSync(path.join(repo, 'Note.md'), 'x\n', 'utf-8');
  const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: repo, encoding: 'utf-8' });
  assert.match(status, /Note\.md/);
  assert.ok(!status.includes('.claude'), status);
  execFileSync('git', ['add', '-A'], { cwd: repo });
  assert.ok(!execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf-8' }).includes('SKILL.md'));
});
