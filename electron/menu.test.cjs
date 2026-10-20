const test = require('node:test');
const assert = require('node:assert/strict');
const { menuLabels, buildMenuTemplate, buildDockTemplate } = require('./menu.cjs');

test('the menu speaks the interface language', () => {
  assert.equal(menuLabels('ru').newNote, 'Новая заметка');
  assert.equal(menuLabels('en').newNote, 'New Note');
  // An unknown language falls back to English rather than to an empty menu.
  assert.equal(menuLabels('de'), menuLabels('en'));
});

test('the menu is the one a desktop app is expected to have', () => {
  const template = buildMenuTemplate('ru', () => {});
  assert.deepEqual(template.map((menu) => menu.label), [
    'Monos', 'Заметка', 'Правка', 'Вид', 'Окно', 'Справка',
  ]);
});

test('every accelerated item hands its work to the page', () => {
  // An accelerator swallows the key: the page would not see it, so such an item
  // has to send a command the page performs.
  const sent = [];
  const template = buildMenuTemplate('en', (command) => sent.push(command));
  const accelerated = template
    .flatMap((menu) => menu.submenu)
    .filter((item) => item.accelerator && item.click);
  assert.ok(accelerated.length > 0);
  for (const item of accelerated) item.click();
  assert.deepEqual(sent, ['settings', 'new-note', 'open-note', 'save', 'print', 'close-note', 'palette', 'terminal', 'help']);
});

test('the labels of the menu do not end with a full stop', () => {
  for (const language of ['en', 'ru']) {
    for (const [name, label] of Object.entries(menuLabels(language))) {
      assert.ok(!label.endsWith('.'), `${name}: ${label}`);
    }
  }
});

test('the items of a menu do not repeat their labels', () => {
  // Two items with the same name in one menu: the person cannot tell them apart.
  for (const language of ['en', 'ru']) {
    for (const menu of buildMenuTemplate(language, () => {})) {
      const labels = menu.submenu.filter((item) => item.label).map((item) => item.label);
      assert.equal(new Set(labels).size, labels.length, `${language}: ${menu.label}`);
    }
  }
});

test('the view menu asks the open note to change its view', () => {
  const sent = [];
  const template = buildMenuTemplate('en', (command) => sent.push(command));
  const view = template.find((menu) => menu.label === 'View');
  for (const item of view.submenu) {
    if (item.label === 'Outline' || item.label === 'Focus Mode') item.click();
  }
  assert.deepEqual(sent, ['outline', 'focus']);
});

test('the view menu shows what the window shows', () => {
  const template = buildMenuTemplate('en', () => {}, {
    hasNote: true, outline: true, focus: false, sidebar: true, terminal: false,
  });
  const view = template.find((menu) => menu.label === 'View');
  const item = (label) => view.submenu.find((entry) => entry.label === label);
  assert.equal(item('Toggle Sidebar').type, 'checkbox');
  assert.equal(item('Toggle Sidebar').checked, true);
  assert.equal(item('Outline').checked, true);
  assert.equal(item('Focus Mode').checked, false);
  assert.equal(item('Terminal').checked, false);
});

test('the items that need a note are greyed out when there is none', () => {
  const template = buildMenuTemplate('en', () => {}, { hasNote: false });
  const view = template.find((menu) => menu.label === 'View');
  const item = (label) => view.submenu.find((entry) => entry.label === label);
  assert.equal(item('Outline').enabled, false);
  assert.equal(item('Focus Mode').enabled, false);
  // The window-wide items stay available without a note.
  assert.notEqual(item('Toggle Sidebar').enabled, false);
  assert.notEqual(item('Terminal').enabled, false);
});

test('the note menu saves and reveals the open note', () => {
  const sent = [];
  const template = buildMenuTemplate('ru', (command) => sent.push(command), { hasNote: true });
  const note = template.find((menu) => menu.label === 'Заметка');
  const item = (label) => note.submenu.find((entry) => entry.label === label);
  assert.equal(item('Сохранить').accelerator, 'Cmd+S');
  assert.equal(item('Сохранить').enabled, true);
  item('Сохранить').click();
  item('Показать в Finder').click();
  assert.deepEqual(sent, ['save', 'reveal-in-finder']);
});

test('the note menu prints the open note', () => {
  const sent = [];
  const template = buildMenuTemplate('ru', (command) => sent.push(command), { hasNote: true });
  const note = template.find((menu) => menu.label === 'Заметка');
  const print = note.submenu.find((entry) => entry.label === 'Печать…');
  assert.equal(print.accelerator, 'Cmd+P');
  print.click();
  assert.deepEqual(sent, ['print']);
});

test('saving and revealing need an open note', () => {
  const template = buildMenuTemplate('ru', () => {}, { hasNote: false });
  const note = template.find((menu) => menu.label === 'Заметка');
  const item = (label) => note.submenu.find((entry) => entry.label === label);
  assert.equal(item('Сохранить').enabled, false);
  assert.equal(item('Показать в Finder').enabled, false);
  assert.equal(item('Печать…').enabled, false);
});

test('the note menu closes the note, the window menu closes the window', () => {
  const sent = [];
  const template = buildMenuTemplate('ru', (command) => sent.push(command), { hasNote: true });
  const note = template.find((menu) => menu.label === 'Заметка');
  const window = template.find((menu) => menu.label === 'Окно');
  note.submenu.find((entry) => entry.label === 'Закрыть заметку').click();
  assert.equal(note.submenu.find((entry) => entry.label === 'Закрыть заметку').accelerator, 'Cmd+W');
  assert.equal(window.submenu.find((entry) => entry.label === 'Закрыть окно').accelerator, 'Shift+Cmd+W');
  assert.deepEqual(sent, ['close-note']);
});

test('the recent notes are listed in their own submenu', () => {
  const sent = [];
  const template = buildMenuTemplate('en', (command, payload) => sent.push([command, payload]), {
    recent: [{ path: 'notes/A.md', name: 'Alpha', label: 'Alpha' }],
  });
  const note = template.find((menu) => menu.label === 'Note');
  const recent = note.submenu.find((entry) => entry.label === 'Open Recent');
  assert.equal(recent.enabled, true);
  recent.submenu[0].click();
  assert.deepEqual(sent, [['open-recent', { path: 'notes/A.md', name: 'Alpha' }]]);
});

test('the recent notes submenu is empty and disabled without notes', () => {
  const template = buildMenuTemplate('en', () => {}, {});
  const note = template.find((menu) => menu.label === 'Note');
  const recent = note.submenu.find((entry) => entry.label === 'Open Recent');
  assert.equal(recent.enabled, false);
  assert.deepEqual(recent.submenu, []);
});

test('the dock menu offers a new note and the notes opened last', () => {
  const sent = [];
  const template = buildDockTemplate('ru', (command, payload) => sent.push([command, payload]), {
    recent: [{ path: 'notes/A.md', name: 'Alpha', label: 'Alpha' }],
  });
  assert.equal(template[0].label, 'Новая заметка');
  template[0].click();
  const recent = template.find((item) => item.label === 'Недавние заметки');
  assert.equal(recent.enabled, true);
  recent.submenu[0].click();
  assert.deepEqual(sent, [['new-note', undefined], ['open-recent', { path: 'notes/A.md', name: 'Alpha' }]]);
});

test('the dock menu without notes keeps only the app commands', () => {
  const template = buildDockTemplate('en', () => {}, {});
  const recent = template.find((item) => item.label === 'Open Recent');
  assert.equal(recent.enabled, false);
  assert.deepEqual(recent.submenu, []);
  assert.ok(template.some((item) => item.label === 'Hide Monos'));
  assert.ok(template.some((item) => item.label === 'Show All'));
});
