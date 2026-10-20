const test = require('node:test');
const assert = require('node:assert/strict');
const { menuLabels, buildMenuTemplate, buildDockTemplate, buildContextMenuTemplate } = require('./menu.cjs');

test('the menu speaks the interface language', () => {
  assert.equal(menuLabels('ru').newNote, 'Новая заметка');
  assert.equal(menuLabels('en').newNote, 'New Note');
  // An unknown language falls back to English rather than to an empty menu.
  assert.equal(menuLabels('de'), menuLabels('en'));
});

test('the menu is the one a desktop app is expected to have', () => {
  const template = buildMenuTemplate('ru', () => {});
  assert.deepEqual(template.map((menu) => menu.label), [
    'Monos', 'Заметка', 'Правка', 'Формат', 'Вид', 'Окно', 'Справка',
  ]);
});

test('the format menu asks the editor to format the text', () => {
  const sent = [];
  const template = buildMenuTemplate('ru', (command) => sent.push(command), { hasNote: true });
  const format = template.find((menu) => menu.label === 'Формат');
  for (const item of format.submenu.filter((entry) => entry.label)) item.click();
  assert.deepEqual(sent, [
    'format-bold', 'format-italic', 'format-strikethrough', 'format-code',
    'format-heading-1', 'format-heading-2', 'format-bullet-list', 'format-numbered-list', 'format-task-list',
  ]);
  // Без заметки форматировать нечего.
  const withoutNote = buildMenuTemplate('ru', () => {}, { hasNote: false });
  const closed = withoutNote.find((menu) => menu.label === 'Формат');
  assert.equal(closed.submenu.find((entry) => entry.label === 'Жирный').enabled, false);
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
  assert.deepEqual(sent, ['settings', 'new-note', 'open-note', 'close-window', 'save', 'print', 'palette', 'terminal', 'help']);
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

test('⌘W closes the note, and the window when there is no note', () => {
  const sent = [];
  const withNote = buildMenuTemplate('ru', (command) => sent.push(command), { hasNote: true });
  const noteMenu = withNote.find((menu) => menu.label === 'Заметка');
  const closeNote = noteMenu.submenu.find((entry) => entry.label === 'Закрыть заметку');
  assert.equal(closeNote.accelerator, 'Cmd+W');
  closeNote.click();

  // Без заметки ⌘W закрывает окно: на macOS он всегда что-то закрывает.
  const withoutNote = buildMenuTemplate('ru', (command) => sent.push(command), { hasNote: false });
  const noteMenuWithout = withoutNote.find((menu) => menu.label === 'Заметка');
  const closeWindow = noteMenuWithout.submenu.find((entry) => entry.label === 'Закрыть окно');
  assert.equal(closeWindow.accelerator, 'Cmd+W');
  closeWindow.click();

  assert.deepEqual(sent, ['close-note', 'close-window']);
});

test('the note menu closes the note, and the window menu keeps the window commands', () => {
  const sent = [];
  const template = buildMenuTemplate('ru', (command) => sent.push(command), { hasNote: true });
  const note = template.find((menu) => menu.label === 'Заметка');
  const window = template.find((menu) => menu.label === 'Окно');
  note.submenu.find((entry) => entry.label === 'Закрыть заметку').click();
  assert.equal(note.submenu.find((entry) => entry.label === 'Закрыть заметку').accelerator, 'Cmd+W');
  // Окно закрывает ⌘W без заметки, а меню «Окно» на macOS окна не закрывает (HIG).
  assert.equal(window.submenu.find((entry) => entry.label === 'Закрыть окно'), undefined);
  assert.deepEqual(sent, ['close-note']);
});

test('the edit menu asks the page to select all, not the browser', () => {
  // Роль браузера выделила бы всю страницу, а не текст там, где стоит каретка.
  const sent = [];
  const template = buildMenuTemplate('ru', (command) => sent.push(command));
  const edit = template.find((menu) => menu.label === 'Правка');
  const selectAll = edit.submenu.find((entry) => entry.label === 'Выделить всё');
  assert.equal(selectAll.role, undefined);
  selectAll.click();
  assert.deepEqual(sent, ['select-all']);
});

test('the menus keep the order macOS expects', () => {
  const template = buildMenuTemplate('en', () => {}, { hasNote: true });
  const note = template.find((menu) => menu.label === 'Note');
  // New, Open, Open Recent, Close, Save, Print — так и ждут в меню «Файл».
  assert.deepEqual(
    note.submenu.filter((item) => item.label).map((item) => item.label),
    ['New Note', 'Open Note…', 'Open Recent', 'Close Note', 'Save', 'Print…', 'Reveal in Finder'],
  );
  const window = template.find((menu) => menu.label === 'Window');
  assert.deepEqual(
    window.submenu.filter((item) => item.label).map((item) => item.label),
    ['Minimize', 'Zoom', 'Bring All to Front'],
  );
});

test('the edit menu finds in the note, and the key stays with the page', () => {  const sent = [];
  const template = buildMenuTemplate('ru', (command) => sent.push(command), { hasNote: true });
  const edit = template.find((menu) => menu.label === 'Правка');
  const find = edit.submenu.find((entry) => entry.label === 'Найти…');
  assert.equal(find.enabled, true);
  // ⌘F остаётся без ускорителя: в терминале она ищет по выводу, в заметке — по её тексту.
  assert.equal(find.accelerator, undefined);
  find.click();
  assert.deepEqual(sent, ['find']);
});

test('finding in a note needs an open note', () => {
  const template = buildMenuTemplate('ru', () => {}, { hasNote: false });
  const edit = template.find((menu) => menu.label === 'Правка');
  assert.equal(edit.submenu.find((entry) => entry.label === 'Найти…').enabled, false);
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

test('the right-click menu in the text is the system one, in the interface language', () => {
  const template = buildContextMenuTemplate('ru');
  // The roles act on the field that holds the cursor.
  assert.deepEqual(template.map((item) => item.role), ['cut', 'copy', 'paste', 'selectAll']);
  assert.deepEqual(template.map((item) => item.label), ['Вырезать', 'Копировать', 'Вставить', 'Выделить всё']);
  assert.deepEqual(
    buildContextMenuTemplate('en').map((item) => item.label),
    ['Cut', 'Copy', 'Paste', 'Select All'],
  );
});
