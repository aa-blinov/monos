import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Сами иконки — .svelte-файлы, Node их не импортирует. Проверяем текстом:
// каждое имя из импорта tree-icons.js должно быть экспортом lucide-svelte.
const here = dirname(fileURLToPath(import.meta.url));
const lucideDist = join(here, '../../node_modules/lucide-svelte/dist');
const source = readFileSync(join(here, 'tree-icons.js'), 'utf8');

function importedNames() {
  const block = source.match(/import\s*\{([^}]*)\}\s*from\s*'lucide-svelte'/);
  assert.ok(block, 'импорт из lucide-svelte не найден');
  return block[1].split(',').map((s) => s.trim()).filter(Boolean);
}

function exportedNames() {
  const names = new Set();
  for (const file of ['icons/index.js', 'aliases.js']) {
    const text = readFileSync(join(lucideDist, file), 'utf8');
    for (const match of text.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
      for (const part of match[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop();
        if (name) names.add(name);
      }
    }
  }
  return names;
}

test('tree-icons: набор не пуст и содержит нужные иконки дерева', () => {
  const names = importedNames();
  assert.ok(names.length > 20, `иконок ${names.length}`);
  for (const name of ['Folder', 'FolderOpen', 'Home', 'Inbox', 'Tag', 'Star', 'Heart']) {
    assert.ok(names.includes(name), name);
  }
});

test('tree-icons: каждая иконка экспортируется lucide-svelte', () => {
  const exported = exportedNames();
  const missing = importedNames().filter((name) => !exported.has(name));
  assert.deepEqual(missing, [], 'пропавшие экспорты lucide-svelte');
});
