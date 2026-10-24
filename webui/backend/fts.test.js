import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { parseSearchQuery } from './search.js';
import {
  ensureFtsSchema,
  indexNoteForFts,
  removeNoteFromFts,
  rebuildFts,
  ftsInSync,
  searchFts,
} from './fts.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE notes_index (
      path TEXT PRIMARY KEY,
      name TEXT,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      is_dir INTEGER DEFAULT 0
    );
  `);
  ensureFtsSchema(db);
  return db;
}

function seed(db) {
  const rows = [
    { path: 'notes/a.md', name: 'a.md', title: 'RAG система', content: 'поиск по векторам', tags: '["llm"]', is_dir: 0 },
    { path: 'notes/b.md', name: 'b.md', title: 'План', content: 'бюджет на 2027 год', tags: '[]', is_dir: 0 },
    { path: 'notes/c.md', name: 'c.md', title: 'Заметки', content: 'разные мысли про rag и подсеть', tags: '[]', is_dir: 0 },
  ];
  const insert = db.prepare('INSERT INTO notes_index (path, name, title, content, tags, is_dir) VALUES (?, ?, ?, ?, ?, ?)');
  for (const row of rows) {
    insert.run(row.path, row.name, row.title, row.content, row.tags, row.is_dir);
    indexNoteForFts(db, row);
  }
  return rows;
}

test('FTS5 доступна в этой сборке better-sqlite3', () => {
  const db = new Database(':memory:');
  assert.doesNotThrow(() => db.exec('CREATE VIRTUAL TABLE t USING fts5(x)'));
});

test('находит заметку по слову из тела', () => {
  const db = makeDb();
  seed(db);
  assert.deepEqual(searchFts(db, { text: ['векторам'], body: [] }, { searchContent: true }), ['notes/a.md']);
});

test('находит по заголовку, имени и тегу', () => {
  const db = makeDb();
  seed(db);
  assert.deepEqual(searchFts(db, { text: ['rag'], body: [] }), ['notes/a.md']);
  assert.deepEqual(searchFts(db, { text: ['llm'], body: [] }), ['notes/a.md']);
  assert.deepEqual(searchFts(db, { text: ['b.md'], body: [] }), ['notes/b.md']);
  // «rag» в c.md лежит только в теле — без поиска по содержимому его нет.
  assert.deepEqual(searchFts(db, { text: ['rag'], body: [] }, { searchContent: true }), ['notes/a.md', 'notes/c.md']);
});

test('слово только в теле не находится, пока не включён поиск по содержимому', () => {
  const db = makeDb();
  seed(db);
  assert.deepEqual(searchFts(db, { text: ['векторам'], body: [] }), []);
  assert.deepEqual(searchFts(db, { text: ['векторам'], body: [] }, { searchContent: true }), ['notes/a.md']);
});

test('несколько слов работают по И', () => {
  const db = makeDb();
  seed(db);
  assert.deepEqual(searchFts(db, { text: ['rag', 'векторам'], body: [] }, { searchContent: true }), ['notes/a.md']);
  assert.deepEqual(searchFts(db, { text: ['rag', 'бюджет'], body: [] }, { searchContent: true }), []);
});

test('совпадение по подстроке, как у старого поиска через includes', () => {
  const db = makeDb();
  seed(db);
  // Именно здесь unicode61 молча терял результаты: «сеть» обязана находить
  // «подсеть», а «план» — «планка».
  assert.deepEqual(searchFts(db, { text: ['сеть'], body: [] }, { searchContent: true }), ['notes/c.md']);
  assert.deepEqual(searchFts(db, { text: ['вектор'], body: [] }, { searchContent: true }), ['notes/a.md']);
  assert.deepEqual(searchFts(db, { text: ['подсе'], body: [] }, { searchContent: true }), ['notes/c.md']);
  assert.deepEqual(searchFts(db, { text: ['сетька'], body: [] }, { searchContent: true }), []);
});

test('короткий запрос отдаёт выборку перебору, а не пустой результат', () => {
  const db = makeDb();
  seed(db);
  // Триграмма не индексирует слова короче трёх букв: такой запрос FTS выполнить
  // не может, поэтому возвращаем null и просим перебрать заметки честно.
  assert.equal(searchFts(db, { text: ['ра'], body: [] }, { searchContent: true }), null);
  assert.equal(searchFts(db, { text: ['rag'], body: [] }, { searchContent: true }).length, 2);
});

test('отрицательный фильтр отдаёт выборку перебору', () => {
  const db = makeDb();
  seed(db);
  // FTS умеет только «содержит»; «не содержит» он выразить не может.
  assert.equal(searchFts(db, { text: [], body: { terms: ['бюджет'], negated: true } }), null);
});

test('операторы и кавычки в запросе не ломают FTS', () => {
  const db = makeDb();
  seed(db);
  // Попытка вырваться из поиска трактуется как обычный текст, а не как запрос.
  assert.deepEqual(searchFts(db, { text: ['rag" OR "1=1'], body: [] }), []);
  // Пунктуация и звёздочка ищутся буквально: «rag*» — это слово с именем,
  // а не префиксный запрос FTS.
  assert.deepEqual(searchFts(db, { text: ['rag*'], body: [] }), []);
  assert.deepEqual(searchFts(db, { text: ['rag)'], body: [] }), []);
  // Кавычка — обычный символ текста (раньше она молча вырезалась из запроса, а в индекс писалась удвоенной):
  // «rag"» такой подстроки нигде нет.
  assert.deepEqual(searchFts(db, { text: ['rag"'], body: [] }), []);
});

test('body: ищет только в содержимом', () => {
  const db = makeDb();
  seed(db);
  assert.deepEqual(searchFts(db, { text: [], body: ['бюджет'] }), ['notes/b.md']);
  assert.deepEqual(searchFts(db, { text: [], body: ['план'] }), []);
});

test('пересборка индекса возвращает его в согласованное состояние', () => {
  const db = makeDb();
  seed(db);
  db.prepare('DELETE FROM notes_fts').run();
  assert.equal(ftsInSync(db), false);
  assert.equal(rebuildFts(db), 3);
  assert.equal(ftsInSync(db), true);
  assert.deepEqual(searchFts(db, { text: ['бюджет'], body: [] }, { searchContent: true }), ['notes/b.md']);
});

test('удалённая из индекса заметка делает индекс непригодным, а не даёт ложный ответ', () => {
  const db = makeDb();
  seed(db);
  removeNoteFromFts(db, 'notes/b.md');
  // Счётчики разошлись — доверять «пустому» ответу нельзя, возвращаем null.
  assert.equal(ftsInSync(db), false);
  assert.equal(searchFts(db, { text: ['бюджет'], body: [] }, { searchContent: true }), null);

  rebuildFts(db);
  assert.equal(ftsInSync(db), true);
  // Пересборка идёт по notes_index, поэтому заметка там остаётся и снова находится.
  assert.deepEqual(searchFts(db, { text: ['бюджет'], body: [] }, { searchContent: true }), ['notes/b.md']);
});

test('каталоги не попадают в полнотекстовый индекс', () => {
  const db = makeDb();
  db.prepare('INSERT INTO notes_index (path, name, is_dir) VALUES (?, ?, 1)').run('notes/dir', 'dir');
  indexNoteForFts(db, { path: 'notes/dir', name: 'dir', is_dir: 1, title: '', tags: '', content: '' });
  assert.equal(ftsInSync(db), false, 'каталог не считается заметкой, поэтому счётчики расходятся');
});

test('индекс не в синхроне — поиск отказывается от него, а не врёт', () => {
  const db = makeDb();
  seed(db);
  db.prepare('INSERT INTO notes_index (path, name) VALUES (?, ?)').run('notes/new.md', 'new.md');
  assert.equal(ftsInSync(db), false);
  assert.equal(searchFts(db, { text: ['rag'], body: [] }), null);
});

test('пустой индекс считается непригодным', () => {
  const db = makeDb();
  assert.equal(ftsInSync(db), false);
  assert.equal(searchFts(db, { text: ['что угодно'], body: [] }), null);
});

test('запрос без терминов не сужает выборку', () => {
  const db = makeDb();
  seed(db);
  assert.equal(searchFts(db, { text: [], body: [] }), null);
  assert.equal(searchFts(db, { text: ['   '], body: [] }), null);
});

test('переиндексация заметки обновляет её в индексе', () => {
  const db = makeDb();
  seed(db);
  const updated = { path: 'notes/b.md', name: 'b.md', title: 'План', content: 'совершенно другое', tags: '[]', is_dir: 0 };
  indexNoteForFts(db, updated);
  assert.deepEqual(searchFts(db, { text: ['бюджет'], body: [] }, { searchContent: true }), []);
  assert.deepEqual(searchFts(db, { text: ['другое'], body: [] }, { searchContent: true }), ['notes/b.md']);
  assert.equal(ftsInSync(db), true);
});

test('русский текст ищется так же, как английский', () => {
  const db = makeDb();
  db.prepare('INSERT INTO notes_index (path, name, title, content, tags, is_dir) VALUES (?, ?, ?, ?, ?, 0)')
    .run('notes/ru.md', 'ru.md', 'Квартальный отчёт', 'выручка выросла на 18 процентов', '[]');
  indexNoteForFts(db, {
    path: 'notes/ru.md', name: 'ru.md', title: 'Квартальный отчёт',
    content: 'выручка выросла на 18 процентов', tags: '[]', is_dir: 0,
  });

  assert.deepEqual(searchFts(db, { text: ['выручка'], body: [] }, { searchContent: true }), ['notes/ru.md']);
  assert.deepEqual(searchFts(db, { text: ['квартальный'], body: [] }), ['notes/ru.md']);
  assert.deepEqual(searchFts(db, { text: ['кварт'], body: [] }), ['notes/ru.md']);
});
test('searchFts принимает результат parseSearchQuery без расхождений формы', () => {
  // Именно это соединение сломалось: searchFts ждал body массивом, а
  // parseSearchQuery отдаёт объект { terms, negated }. Тогда FTS молча падал,
  // маршрут уходил в запасной перебор — и поиск был медленным, но «правильным».
  const db = makeDb();
  seed(db);

  const plain = parseSearchQuery('rag');
  assert.ok(Array.isArray(plain.text));
  assert.deepEqual(searchFts(db, plain, { searchContent: true }), ['notes/a.md', 'notes/c.md']);

  const withBody = parseSearchQuery('body:бюджет');
  assert.deepEqual(withBody.body.terms, ['бюджет']);
  assert.deepEqual(searchFts(db, withBody), ['notes/b.md']);

  const mixed = parseSearchQuery('план body:бюджет');
  assert.deepEqual(searchFts(db, mixed), ['notes/b.md']);
});

test('пустой разобранный запрос не роняет индекс', () => {
  const db = makeDb();
  seed(db);
  assert.equal(searchFts(db, parseSearchQuery('')), null);
  assert.equal(searchFts(db, parseSearchQuery('   ')), null);
  assert.equal(searchFts(db, null), null);
});

test('на неселективном запросе индекс уступает перебору', () => {
  const db = makeDb();
  const insert = db.prepare('INSERT INTO notes_index (path, name, title, content, tags, is_dir) VALUES (?, ?, ?, ?, ?, 0)');
  db.transaction(() => {
    for (let i = 0; i < 40; i += 1) {
      const row = {
        path: `notes/n${i}.md`, name: `n${i}.md`, title: `Заметка ${i}`,
        content: i % 2 === 0 ? 'общий текст про заметки' : 'общий текст про заметки',
        tags: '[]', is_dir: 0,
      };
      insert.run(row.path, row.name, row.title, row.content, row.tags);
      indexNoteForFts(db, row);
    }
  })();

  // Подстрока встречается в каждой второй заметке — отбор не сужает выборку,
  // поэтому индекс только добавит работы и возвращаем null.
  assert.equal(searchFts(db, { text: ['заметки'], body: [] }, { searchContent: true }), null);

  // А редкое слово работает как надо.
  db.prepare("UPDATE notes_index SET content = content || ' игломагнитныймаркер' WHERE path = 'notes/n1.md'").run();
  const rare = { path: 'notes/n1.md', name: 'n1.md', title: 'Заметка 1', content: 'общий текст про заметки игломагнитныймаркер', tags: '[]', is_dir: 0 };
  indexNoteForFts(db, rare);
  assert.deepEqual(searchFts(db, { text: ['игломагнитныймаркер'], body: [] }, { searchContent: true }), ['notes/n1.md']);
});

test('на маленьком корпусе индекс не отключается — перебор и так мгновенный', () => {
  const db = makeDb();
  seed(db);
  // 3 заметки, 2 совпадения: доля больше порога, но корпус слишком мал,
  // чтобы отбор что-то решал.
  assert.deepEqual(searchFts(db, { text: ['rag'], body: [] }, { searchContent: true }), ['notes/a.md', 'notes/c.md']);
});
