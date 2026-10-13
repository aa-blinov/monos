import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitFrontmatter,
  parseFrontmatter,
  upsertFrontmatter,
  setFrontmatterKey,
  dueStatus,
  dueLabel,
} from './frontmatter.js';

test('splitFrontmatter отделяет шапку от тела', () => {
  const note = '---\ntitle: "Заметка"\n---\n\nТело заметки\n';
  assert.equal(parseFrontmatter(note).title, 'Заметка');
  assert.equal(splitFrontmatter(note).body, 'Тело заметки\n');
});

test('заметка без шапки разбирается целиком как тело', () => {
  assert.deepEqual(parseFrontmatter('Просто текст\n'), {
    title: '', category: '', tags: [], due: '', pinned: false,
  });
  assert.equal(splitFrontmatter('Просто текст\n').body, 'Просто текст\n');
});

test('читаются title, category, tags, due и pinned', () => {
  const note = '---\ntitle: "План"\ncategory: "Работа"\ntags: ["llm", "исследования"]\ndue: 2026-10-20\npinned: true\n---\n\nТело\n';
  assert.deepEqual(parseFrontmatter(note), {
    title: 'План',
    category: 'Работа',
    tags: ['llm', 'исследования'],
    due: '2026-10-20',
    pinned: true,
  });
});

test('теги без кавычек тоже читаются', () => {
  assert.deepEqual(parseFrontmatter('---\ntags: [alpha, beta]\n---\n\nx\n').tags, ['alpha', 'beta']);
});

test('upsertFrontmatter сохраняет неизвестные ключи', () => {
  const note = '---\ntitle: "Старый"\ncustom_key: значение\nдругой: 42\n---\n\nТело\n';
  const next = upsertFrontmatter(note, { title: 'Новый', tags: ['a'] });
  assert.match(next, /custom_key: значение/);
  assert.match(next, /другой: 42/);
  assert.match(next, /title: "Новый"/);
  assert.match(next, /tags: \["a"\]/);
});

test('пустой due удаляет ключ, а не пишет пустую строку', () => {
  const withDue = '---\ntitle: "П"\ndue: 2026-10-20\n---\n\nТело\n';
  const next = upsertFrontmatter(withDue, { title: 'П', tags: [], due: '' });
  assert.ok(!next.includes('due:'), `ключ due остался: ${next}`);
});

test('setFrontmatterKey ставит и снимает срок, не трогая остальное', () => {
  const note = '---\ntitle: "П"\ntags: ["a"]\ncustom: keep\n---\n\nТело\n';

  const withDue = setFrontmatterKey(note, 'due', '2026-11-01');
  assert.match(withDue, /due: 2026-11-01/);
  assert.match(withDue, /custom: keep/);

  const cleared = setFrontmatterKey(withDue, 'due', '');
  assert.ok(!cleared.includes('due:'), `ключ due остался: ${cleared}`);
  assert.match(cleared, /custom: keep/);
});

test('setFrontmatterKey игнорирует чужой ключ', () => {
  const note = '---\ntitle: "П"\n---\n\nТело\n';
  assert.equal(setFrontmatterKey(note, 'неизвестный', 'x'), note);
});

test('тело заметки не меняется при работе со сроком', () => {
  const note = '---\ntitle: "П"\n---\n\nТело заметки\n\nВторой абзац\n';
  const next = setFrontmatterKey(note, 'due', '2026-10-20');
  assert.ok(next.endsWith('Тело заметки\n\nВторой абзац\n'));
});

test('dueStatus различает просрочку, сегодня и будущее', () => {
  const now = new Date(2026, 9, 12);
  assert.equal(dueStatus('', now), 'none');
  assert.equal(dueStatus('2026-10-10', now), 'overdue');
  assert.equal(dueStatus('2026-10-12', now), 'today');
  assert.equal(dueStatus('2026-10-14', now), 'soon');
  assert.equal(dueStatus('2026-11-20', now), 'later');
  assert.equal(dueStatus('ерунда', now), 'none');
});

test('срок на сегодня не считается просроченным из-за времени суток', () => {
  const lateEvening = new Date(2026, 9, 12, 23, 30);
  assert.equal(dueStatus('2026-10-12', lateEvening), 'today');
  const earlyMorning = new Date(2026, 9, 12, 0, 5);
  assert.equal(dueStatus('2026-10-12', earlyMorning), 'today');
});

test('dueLabel собирает понятные подписи', () => {
  const now = new Date(2026, 9, 12);
  const strings = {
    overdue: (days) => `просрочено на ${days} дн.`,
    today: 'сегодня',
    tomorrow: 'завтра',
    inDays: (days) => `через ${days} дн.`,
    onDate: (date) => `${date.getDate()}.${date.getMonth() + 1}`,
  };
  assert.equal(dueLabel('2026-10-10', now, strings), 'просрочено на 2 дн.');
  assert.equal(dueLabel('2026-10-12', now, strings), 'сегодня');
  assert.equal(dueLabel('2026-10-13', now, strings), 'завтра');
  assert.equal(dueLabel('2026-10-14', now, strings), 'через 2 дн.');
  assert.equal(dueLabel('2026-12-01', now, strings), '1.12');
  assert.equal(dueLabel('', now, strings), '');
});
test('переименование заметки не стирает срок', () => {
  // Регрессия: upsertFrontmatter выбрасывает управляемые ключи, которых нет в
  // аргументах. Если редактор передаёт только заголовок и теги, `due` исчез бы
  // из файла при каждом переименовании — вместе с напоминанием.
  const note = '---\ntitle: "Старое"\ndue: 2026-10-20\n---\n\nТело\n';
  const renamed = upsertFrontmatter(note, { title: 'Новое', tags: ['a'], due: '2026-10-20' });
  assert.match(renamed, /due: 2026-10-20/);
  assert.equal(parseFrontmatter(renamed).due, '2026-10-20');

  // Контроль: без срока в аргументах ключ действительно был бы потерян —
  // именно поэтому редактор обязан его передавать.
  const withoutDue = upsertFrontmatter(note, { title: 'Новое', tags: ['a'] });
  assert.ok(!withoutDue.includes('due:'), 'проверка-контроль: срок должен был бы пропасть');
});

test('BOM и CRLF переживают переписывание шапки', () => {
  // Регрессия QA: заметка с BOM теряла его, а CRLF-файл получал смешанные
  // переводы строк — шапка на LF, тело на CRLF. Git в таком случае перерисовывает
  // весь файл, и настоящее изменение теряется в шуме.
  const crlf = '---\r\ntitle: "Старый"\r\n---\r\n\r\nТело\r\n';
  const next = upsertFrontmatter(crlf, { title: 'Новый', tags: ['a'] });
  assert.ok(next.startsWith('---\r\n'), 'шапка должна остаться на CRLF');
  assert.ok(!/[^\r]\n/.test(next.replace(/\r\n/g, '')), 'смешанных переводов строк быть не должно');
  assert.ok(next.includes('Тело\r\n'), 'тело должно остаться на CRLF');

  const bom = '\uFEFF---\ntitle: "Старый"\n---\n\nТекст.\n';
  const nextBom = upsertFrontmatter(bom, { title: 'Новый', tags: [] });
  assert.ok(nextBom.startsWith('\uFEFF'), 'BOM обязан остаться');
});

test('тело CRLF-файла не смешивается с шапкой', () => {
  const note = '---\r\ntitle: "A"\r\n---\r\n\r\nСтрока\r\n';
  const next = setFrontmatterKey(note, 'due', '2026-10-20');
  const withoutCrlf = next.replace(/\r\n/g, '');
  assert.ok(!withoutCrlf.includes('\n'), 'все переводы строк должны остаться CRLF');
});

// --- Свойства: закрепление и блочные теги ---------------------------------

test('закрепление включается и снимается через setFrontmatterKey', async () => {
  const { setFrontmatterKey } = await import('./frontmatter.js');
  const note = '---\ntitle: "З"\ntags: ["a"]\n---\n\nТекст.\n';

  const pinned = setFrontmatterKey(note, 'pinned', 'true');
  assert.match(pinned, /pinned: true/);
  assert.match(pinned, /title: "З"/);

  // Ключ должен исчезнуть, а не остаться «pinned: false» в файле.
  const unpinned = setFrontmatterKey(pinned, 'pinned', '');
  assert.doesNotMatch(unpinned, /pinned/);
  assert.match(unpinned, /title: "З"/);
});

test('блочные теги не протекают в тело при перезаписи шапки', async () => {
  // tags: со списком на следующих строках — обычный YAML. Такие строки не
  // содержат «:» и раньше переживали перезапись, оседая под due внутри
  // frontmatter, то есть заметка портилась при первом же сохранении свойств.
  const { upsertFrontmatter } = await import('./frontmatter.js');
  const note = '---\ntitle: "З"\ntags:\n  - "старое"\n  - "ещё"\npinned: true\n---\n\nТекст.\n';

  // Управляемый ключ, которого не передали, считается снятым —
  // поэтому pinned здесь обязателен.
  const next = upsertFrontmatter(note, { title: 'З', tags: ['новое'], due: '', pinned: true });
  assert.match(next, /tags: \["новое"\]/);
  assert.doesNotMatch(next, /- "старое"/);
  assert.doesNotMatch(next, /- "ещё"/);
  assert.match(next, /pinned: true/);
});

test('блочные теги читаются и не теряются при перезаписи', async () => {
  const { parseFrontmatter, upsertFrontmatter } = await import('./frontmatter.js');
  const note = '---\ntitle: "З"\ntags:\n  - "раз"\n  - "два: три"\n---\n\nТело.\n';

  // Раньше блочный YAML не читался: теги были не видны в панели свойств и
  // молча пропадали при первом сохранении.
  assert.deepEqual(parseFrontmatter(note).tags, ['раз', 'два: три']);

  const next = upsertFrontmatter(note, { title: 'З', category: '', tags: parseFrontmatter(note).tags, due: '', pinned: false });
  assert.match(next, /"раз"/);
  assert.match(next, /"два: три"/);
  assert.doesNotMatch(next, /^\s+-\s/m, 'старый блочный список не должен оставаться в шапке');
});
