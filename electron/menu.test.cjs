const test = require('node:test');
const assert = require('node:assert/strict');
const { menuLabels, buildMenuTemplate } = require('./menu.cjs');

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
  assert.deepEqual(sent, ['settings', 'new-note', 'open-note', 'palette', 'terminal', 'help']);
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
