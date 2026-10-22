import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEARCH_CLEAR_CLASS, SEARCH_ICON_CLASS, SEARCH_INPUT_CLASS } from './search-field.js';

test('поиск выглядит как на доске: фон, рамка, высота, отступ под лупу', () => {
  for (const part of ['bg-[var(--bg-secondary)]', 'border-[var(--border-subtle)]', 'pl-10', 'text-sm', 'focus:border-[var(--text-primary)]']) {
    assert.ok(SEARCH_INPUT_CLASS.includes(part), part);
  }
  assert.match(SEARCH_ICON_CLASS, /left-3/);
  assert.match(SEARCH_CLEAR_CLASS, /h-8 w-8/);
});

test('поля поиска в приложении — одно и то же поле, а не свои копии', () => {
  const read = (name) => fs.readFileSync(new URL(`../components/${name}.svelte`, import.meta.url), 'utf-8');
  for (const name of ['HelpView', 'PropertiesView', 'TemplateManager', 'TagPanel']) assert.match(read(name), /<SearchField\b/, name);
  assert.match(read('Header'), /<SearchField\b/);
  assert.match(read('SearchField'), /KitSearchField/);
  assert.match(read('CommandPalette'), /h-11 lg:h-10 \{SEARCH_INPUT_CLASS\}/);
  assert.match(read('TerminalPanel'), /h-8 \{SEARCH_INPUT_COMPACT_CLASS\}/);
});
