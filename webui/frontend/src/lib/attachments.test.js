import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentTimestamp,
  defaultImageName,
  imageNameFor,
  markdownLinkPath,
  isImageFile,
  firstImageFileFromFileList,
  firstImageFileFromDataTransfer,
  firstImageFileFromText,
  markdownImage,
  imageDisplayName,
} from './attachments.js';

const fixedDate = new Date(2026, 0, 15, 14, 30, 45); // 2026-01-15 14:30:45 local

test('attachmentTimestamp возвращает YYYYMMDD-HHMMSS', () => {
  assert.equal(attachmentTimestamp(fixedDate), '20260115-143045');
});

test('defaultImageName использует webp расширение', () => {
  assert.equal(defaultImageName(fixedDate), 'image-20260115-143045.webp');
});

test('isImageFile ловит только image/* mime', () => {
  assert.equal(isImageFile({ type: 'image/png' }), true);
  assert.equal(isImageFile({ type: 'image/webp' }), true);
  assert.equal(isImageFile({ type: 'text/plain' }), false);
  assert.equal(isImageFile({}), false);
  assert.equal(isImageFile(null), false);
});

test('firstImageFileFromFileList находит первый image-файл', () => {
  const files = [{ type: 'text/plain' }, { type: 'image/jpeg' }, { type: 'image/png' }];
  assert.equal(firstImageFileFromFileList(files), files[1]);
  assert.equal(firstImageFileFromFileList([]), null);
  assert.equal(firstImageFileFromFileList(null), null);
});

test('firstImageFileFromDataTransfer итерирует items', () => {
  const dt = {
    files: [{ type: 'text/plain' }],
    items: [
      { kind: 'file', type: 'text/plain' },
      { kind: 'file', type: 'image/jpeg', getAsFile: () => ({ type: 'image/jpeg' }) },
    ],
  };
  const result = firstImageFileFromDataTransfer(dt);
  assert.equal(result?.type, 'image/jpeg');
});

test('firstImageFileFromText возвращает null (нет image в plain text)', () => {
  assert.equal(firstImageFileFromText('just some text'), null);
});

test('markdownImage формирует image-синтаксис с relativePath', () => {
  assert.equal(
    markdownImage('shot.png', '_attachments/shot.png'),
    '![shot](_attachments/shot.png)',
  );
});

test('imageDisplayName убирает путь и расширение', () => {
  assert.equal(imageDisplayName('_attachments/photo.png'), 'photo');
  assert.equal(imageDisplayName('photo.jpeg'), 'photo');
  // пустой ввод → 'image' (дефолт в самой функции)
  assert.equal(imageDisplayName(''), 'image');
});

test('imageNameFor: осмысленное имя остаётся, безликое заменяется датой, всегда .webp', () => {
  assert.equal(imageNameFor({ name: 'Снимок экрана 2026-10-16 в 10.58.png' }, fixedDate), 'Снимок экрана 2026-10-16 в 10.58.webp');
  assert.equal(imageNameFor({ name: 'image.png' }, fixedDate), 'image-20260115-143045.webp');
  assert.equal(imageNameFor({ name: 'IMG_1234.JPG' }, fixedDate), 'IMG_1234.webp');
  assert.equal(imageNameFor({ name: 'blob' }, fixedDate), 'image-20260115-143045.webp');
  assert.equal(imageNameFor({ name: 'схема: вход/выход?.png' }, fixedDate), 'схема вход выход.webp');
  assert.equal(imageNameFor({}, fixedDate), 'image-20260115-143045.webp');
});

test('markdownLinkPath экранирует пробелы и скобки, кириллицу оставляет читаемой', () => {
  assert.equal(markdownLinkPath('_attachments/Снимок экрана (1).webp'), '_attachments/Снимок%20экрана%20%281%29.webp');
  assert.equal(decodeURI(markdownLinkPath('_attachments/Снимок экрана.webp')), '_attachments/Снимок экрана.webp');
});

test('filterAttachments: по имени файла, по названию заметки и «неиспользуемые»', async () => {
  const { filterAttachments } = await import('./attachments.js');
  const items = [
    { name: 'plan.png', usedBy: [{ path: 'a.md', title: 'Roadmap' }] },
    { name: 'old.png', usedBy: [] },
  ];
  assert.deepEqual(filterAttachments(items, { query: 'PLAN' }).map((i) => i.name), ['plan.png']);
  assert.deepEqual(filterAttachments(items, { query: 'road' }).map((i) => i.name), ['plan.png']);
  assert.deepEqual(filterAttachments(items, { filter: 'unused' }).map((i) => i.name), ['old.png']);
  // A closed locked note may use anything, so nothing counts as unused.
  assert.deepEqual(filterAttachments(items, { filter: 'unused', lockedNotes: 1 }), []);
});

test('sortAttachments, attachmentFolders и attachmentEmbed', async () => {
  const { sortAttachments, attachmentFolders, attachmentEmbed, filterAttachments } = await import('./attachments.js');
  const items = [
    { name: 'b.png', kind: 'image', folder: 'A', size: 10, modified: '2026-01-02', usedBy: [] },
    { name: 'a10.png', kind: 'image', folder: 'B', size: 30, modified: '2026-01-03', usedBy: [{ title: 'x' }, { title: 'y' }] },
    { name: 'a2.pdf', kind: 'pdf', folder: 'A', size: 20, modified: '2026-01-01', usedBy: [{ title: 'x' }] },
  ];
  assert.deepEqual(sortAttachments(items, 'new').map((i) => i.name), ['a10.png', 'b.png', 'a2.pdf']);
  assert.deepEqual(sortAttachments(items, 'size').map((i) => i.name), ['a10.png', 'a2.pdf', 'b.png']);
  assert.deepEqual(sortAttachments(items, 'name').map((i) => i.name), ['a2.pdf', 'a10.png', 'b.png']);
  assert.deepEqual(sortAttachments(items, 'notes').map((i) => i.name), ['a10.png', 'a2.pdf', 'b.png']);
  assert.deepEqual(attachmentFolders(items), [{ folder: 'A', count: 2 }, { folder: 'B', count: 1 }]);
  assert.equal(attachmentEmbed({ kind: 'pdf', name: 'a b.pdf' }), '![[a b.pdf]]');
  assert.equal(attachmentEmbed({ kind: 'image', name: 'a b.png' }), '![](_attachments/a%20b.png)');
  assert.deepEqual(filterAttachments(items, { kind: 'pdf' }).map((i) => i.name), ['a2.pdf']);
  assert.deepEqual(filterAttachments(items, { folder: 'B' }).map((i) => i.name), ['a10.png']);
  assert.deepEqual(filterAttachments(items, { query: 'a2', folder: 'A' }).map((i) => i.name), ['a2.pdf']);
});

test('поиск не различает _ - . и пробел, «Одинаковые имена», хвост папки', async () => {
  const { filterAttachments, duplicateNames, folderTail } = await import('./attachments.js');
  const items = [
    { name: 'IMG_4021.png', folder: 'A', usedBy: [] },
    { name: 'img_4021.PNG', folder: 'B', usedBy: [] },
    { name: 'other.png', folder: 'A/B/C/D', usedBy: [] },
  ];
  assert.equal(filterAttachments(items, { query: 'img 4021' }).length, 2);
  assert.equal(filterAttachments(items, { query: 'IMG-4021' }).length, 2);
  assert.deepEqual([...duplicateNames(items)], ['img_4021.png']);
  assert.equal(filterAttachments(items, { filter: 'duplicates' }).length, 2);
  assert.equal(folderTail('A/B/C/D'), '… / C / D');
  assert.equal(folderTail('A/B'), 'A / B');
  assert.equal(folderTail(''), '/');
});
