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
