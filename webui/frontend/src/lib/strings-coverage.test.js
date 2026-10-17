import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations } from './strings.js';

// Every interface text a component asks for exists in every language. A missing key renders as the word
// "undefined" (the sidebar's context menu showed it twice), and nothing else catches it until someone sees it.
const here = path.dirname(fileURLToPath(import.meta.url));
const sources = [path.join(here, '..', 'App.svelte'), ...fs.readdirSync(path.join(here, '..', 'components'))
  .filter((name) => name.endsWith('.svelte'))
  .map((name) => path.join(here, '..', 'components', name))];

function usedKeys(source) {
  const keys = new Set();
  for (const match of source.matchAll(/\$localizedText((?:\.[A-Za-z_$][\w$]*)+)/g)) keys.add(match[1].slice(1));
  return keys;
}

const resolve = (object, keyPath) => keyPath.split('.').reduce((value, key) => (value == null ? value : value[key]), object);

test('каждый текст, который просят компоненты, есть во всех языках', () => {
  const missing = [];
  for (const file of sources) {
    const keys = usedKeys(fs.readFileSync(file, 'utf-8'));
    for (const key of keys) {
      for (const [language, text] of Object.entries(translations)) {
        // A key may name a whole section that is passed on (`$localizedText.editor`); it must exist all the same.
        if (resolve(text, key) === undefined) missing.push(`${path.basename(file)}: ${key} (${language})`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
