/**
 * Static checks that keep the docs in sync with the codebase.
 *
 * Run from the repo root: `node --test docs/docs-freshness.test.js`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const libDir = join(repoRoot, 'webui/frontend/src/lib');
const libDoc = readFileSync(join(repoRoot, 'docs/LIB.md'), 'utf8');

function listLibModules() {
  const out = [];
  for (const name of readdirSync(libDir)) {
    const full = join(libDir, name);
    if (statSync(full).isDirectory()) {
      // e.g. lib/api/client.js → feature "api/client"
      for (const sub of readdirSync(full)) {
        if (sub.endsWith('.js') && !sub.endsWith('.test.js')) {
          out.push(`${name}/${basename(sub, '.js')}`);
        }
      }
    } else if (name.endsWith('.js') && !name.endsWith('.test.js')) {
      out.push(basename(name, '.js'));
    }
  }
  return out.sort();
}

function existsInLib(relPath) {
  try {
    return statSync(join(libDir, `${relPath}.test.js`)).isFile();
  } catch {
    return false;
  }
}

test('docs/LIB.md существует и не пустой', () => {
  assert.ok(libDoc.length > 1000, 'LIB.md должен содержать реальное описание');
  assert.match(libDoc, /^# `?lib\/`? Module Map/m);
});

test('docs/LIB.md упоминает каждый модуль из lib/ (без учёта .test.js)', () => {
  const modules = listLibModules();
  assert.ok(modules.length > 20, `ожидалось много модулей, нашлось ${modules.length}`);
  const missing = modules.filter((m) => {
    // ищем упоминание как `\`${m}\`` или как ссылку в таблице.
    // для вложенных (api/client.js) ищем по basename "client"
    const patterns = [
      new RegExp('`' + m.replace(/[/.]/g, '[/.]') + '`'),
      new RegExp('\\b' + basename(m).replace(/[/.]/g, '[/.]') + '\\b'),
    ];
    return !patterns.some((p) => p.test(libDoc));
  });
  assert.equal(
    missing.length,
    0,
    `LIB.md не упоминает модули: ${missing.join(', ')}\n` +
      `Добавь строку в таблицу — иначе новый контрибьютор не найдёт helper.`,
  );
});

test('docs/architecture.md упоминает ключевые системы', () => {
  const arch = readFileSync(join(repoRoot, 'docs/architecture.md'), 'utf8');
  for (const keyword of ['Theme System', 'Internationalization', 'stores.js', 'node:test', 'vitest', 'TDD']) {
    assert.match(arch, new RegExp(keyword, 'i'), `ARCHITECTURE.md должен упоминать «${keyword}»`);
  }
});

test('docs/CONTRIBUTING.md содержит секцию Conventions', () => {
  const contrib = readFileSync(join(repoRoot, 'docs/CONTRIBUTING.md'), 'utf8');
  assert.match(contrib, /^## Conventions/m, 'должна быть секция Conventions');
  assert.match(contrib, /TDD/i, 'должно упоминаться TDD');
  assert.match(contrib, /lib\//, 'должны упоминаться lib helper\'ы');
});

test('docs/STATE.md описывает 3 уровня state', () => {
  const state = readFileSync(join(repoRoot, 'docs/STATE.md'), 'utf8');
  assert.match(state, /Global persisted/i);
  assert.match(state, /Per-Feature/i);
  assert.match(state, /Cross-Feature/i);
  assert.match(state, /persisted\(/, 'должна быть ссылка на persisted() wrapper');
});

test('README ссылается на все docs/ файлы', () => {
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  for (const doc of ['architecture.md', 'STATE.md', 'LIB.md', 'FRONTMATTER.md', 'CONTRIBUTING.md', 'PUBLISHING.md']) {
    assert.ok(
      readme.includes(doc),
      `README.md должен ссылаться на ${doc}`,
    );
  }
});

test('relative paths в тесте корректны', () => {
  // smoke test, чтобы при перемещении теста сразу увидеть поломку
  assert.equal(relative(repoRoot, libDir), 'webui/frontend/src/lib');
});

test('каждый lib/*.js имеет парный *.test.js (TDD convention)', () => {
  const modules = listLibModules();
  const untested = modules.filter((m) => !existsInLib(m));
  assert.equal(
    untested.length,
    0,
    `Следующие модули в lib/ не имеют парного *.test.js:\n` +
      untested.map((m) => `  - lib/${m}.js`).join('\n') +
      `\nЛибо добавь lib/${untested[0] || 'X'}.test.js, либо вынеси в components/ если модуль Svelte-specific.`,
  );
});
