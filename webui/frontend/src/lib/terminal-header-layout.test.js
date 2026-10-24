import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The terminal exists only in the desktop app, so its header is checked in the source: the page has no terminal to
// open. What went wrong once: a <div> around the tabs was never closed, so the buttons at the right sat inside it and
// moved with every shell that was opened, and the tab strip had no room to scroll in.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'TerminalPanel.svelte'), 'utf8');
const header = source.slice(source.indexOf('<header'), source.indexOf('</header>'));
const afterHeader = source.slice(source.indexOf('</header>'), source.indexOf('{#if searchOpen}'));

test('the tabs sit in their own box that takes the free room and may shrink, and every <div> of the header is closed', () => {
  assert.match(header, /<div class="flex min-w-0 flex-1 items-center gap-1/);
  assert.equal((header.match(/<div\b/g) || []).length, (header.match(/<\/div>/g) || []).length);
});

test('the menu and the hide button follow the tabs and do not shrink', () => {
  assert.ok(header.indexOf('data-testid="terminal-menu"') > header.indexOf('<Tabs'));
  assert.match(header.slice(header.indexOf('terminal.hide')-120), /shrink-0/);
});

test('the agent button is in a row of its own under the header, flush right, not in the tab header', () => {
  assert.doesNotMatch(header, /agent-launch/);
  assert.match(afterHeader, /justify-end[^>]*data-testid="terminal-agent-row"/);
  assert.match(afterHeader, /data-testid="agent-launch"/);
});

test('the shell that was just opened is brought into view in the scrolling strip', () => {
  assert.match(source, /scrollIntoView\(\{ inline: 'nearest'/);
});
