import test from 'node:test';
import assert from 'node:assert/strict';
import { hasConflictMarkers, parseConflictRegions, resolveConflictMarkers, resolveRegion, splitByConflicts, summarizeConflicts } from './conflict-markers.js';

const CONFLICTED = [
  'Вступление.',
  '',
  '<<<<<<< HEAD',
  'Моя версия абзаца.',
  '=======',
  'Версия с другого устройства.',
  '>>>>>>> MacBook',
  '',
  'Заключение.',
].join('\n');

test('обычная заметка не считается конфликтной', () => {
  assert.equal(hasConflictMarkers('# Заголовок\n\nОбычный текст.'), false);
});

test('строка из семи знаков «равно» сама по себе — не конфликт', () => {
  // setext-подчёркивание в валидном Markdown: заголовок + =======
  assert.equal(hasConflictMarkers('Заголовок\n=======\n\nТекст.'), false);
});

test('конфликтная заметка распознаётся', () => {
  assert.equal(hasConflictMarkers(CONFLICTED), true);
  assert.equal(summarizeConflicts(CONFLICTED).count, 1);
});

test('разбор выделяет обе стороны и их границы', () => {
  const [region] = parseConflictRegions(CONFLICTED);
  assert.equal(region.ours, 'Моя версия абзаца.');
  assert.equal(region.theirs, 'Версия с другого устройства.');
  assert.equal(region.base, '');
  // the region must cover exactly the marker block, including the >>>>>>> line
  const extracted = CONFLICTED.slice(region.start, region.end);
  assert.match(extracted, /^<<<<<<< HEAD/);
  assert.match(extracted, />>>>>>> MacBook\n$/);
});

test('зодиф3-разделитель читается как базовая версия', () => {
  const text = ['<<<<<<< this device', 'local', '||||||| base', 'original', '=======', 'remote', '>>>>>>> other device'].join('\n');
  const [region] = parseConflictRegions(text);
  assert.equal(region.ours, 'local');
  assert.equal(region.base, 'original');
  assert.equal(region.theirs, 'remote');
});

test('незакрытый блок маркеров не считается конфликтом', () => {
  assert.equal(hasConflictMarkers('текст\n<<<<<<< HEAD\nбез закрытия'), false);
});

test('несколько конфликтов считаются все', () => {
  const two = `${CONFLICTED}\n\n---\n\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> other`;
  assert.equal(summarizeConflicts(two).count, 2);
});

test('resolve ours оставляет свою версию и снимает маркеры', () => {
  const resolved = resolveConflictMarkers(CONFLICTED, 'ours');
  assert.match(resolved, /Моя версия абзаца\./);
  assert.doesNotMatch(resolved, /Версия с другого устройства/);
  assert.doesNotMatch(resolved, /<{7}|={7}|>{7}/);
  assert.equal(hasConflictMarkers(resolved), false);
  // the surrounding document must survive untouched
  assert.match(resolved, /Вступление\./);
  assert.match(resolved, /Заключение\./);
});

test('resolve theirs оставляет чужую версию', () => {
  const resolved = resolveConflictMarkers(CONFLICTED, 'theirs');
  assert.match(resolved, /Версия с другого устройства\./);
  assert.doesNotMatch(resolved, /Моя версия/);
});

test('resolve both объединяет обе версии — случай ежедневной заметки', () => {
  const resolved = resolveConflictMarkers(CONFLICTED, 'both');
  assert.match(resolved, /Моя версия абзаца\./);
  assert.match(resolved, /Версия с другого устройства\./);
  assert.equal(hasConflictMarkers(resolved), false);
});

test('разрешение нескольких конфликтов за один проход', () => {
  const two = `${CONFLICTED}\n\n---\n\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> other`;
  const resolved = resolveConflictMarkers(two, 'ours');
  assert.equal(hasConflictMarkers(resolved), false);
  assert.match(resolved, /Заключение\./);
});

test('разрешение непустой заметки ничего не меняет', () => {
  const plain = '# Обычная\n\nТекст.';
  assert.equal(resolveConflictMarkers(plain, 'both'), plain);
});
// --- in-place segments and single-region resolution -------------------------

test('splitByConflicts сохраняет текст вокруг конфликта', () => {
  const segments = splitByConflicts(CONFLICTED);
  assert.equal(segments.filter((s) => s.type === 'conflict').length, 1);
  const joined = segments.map((s) => (s.type === 'text' ? s.value : '')).join('');
  assert.match(joined, /Вступление\./, 'вступление обязано остаться');
  assert.match(joined, /Заключение\./, 'заключение обязано остаться');
  assert.doesNotMatch(joined, /<{7}|={7}|>{7}/, 'маркеры уходят внутрь конфликтного сегмента');
});

test('splitByConflicts на чистой заметке даёт один текстовый сегмент', () => {
  const segments = splitByConflicts('# Обычная\n\nТекст.');
  assert.equal(segments.length, 1);
  assert.equal(segments[0].type, 'text');
});

test('splitByConflicts делит по нескольким конфликтам', () => {
  const two = `${CONFLICTED}\n\n---\n\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> other`;
  assert.equal(splitByConflicts(two).filter((s) => s.type === 'conflict').length, 2);
});

test('resolveRegion снимает только выбранный конфликт', () => {
  const two = `${CONFLICTED}\n\n---\n\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> other`;
  const out = resolveRegion(two, 0, 'ours');
  assert.equal(hasConflictMarkers(out), true, 'второй конфликт обязан остаться');
  assert.match(out, /Моя версия абзаца\./);
  assert.doesNotMatch(out, /Версия с другого устройства\./);
  assert.match(out, /A/);
  assert.match(out, /B/);
});

test('resolveRegion с choice both объединяет обе стороны', () => {
  const out = resolveRegion(CONFLICTED, 0, 'both');
  assert.match(out, /Моя версия абзаца\./);
  assert.match(out, /Версия с другого устройства\./);
  assert.equal(hasConflictMarkers(out), false);
});

test('разрешение последнего региона снимает все маркеры', () => {
  const two = `${CONFLICTED}\n\n---\n\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> other`;
  let out = two;
  out = resolveRegion(out, 0, 'ours');
  out = resolveRegion(out, 0, 'theirs');
  assert.equal(hasConflictMarkers(out), false);
  assert.match(out, /Моя версия/);
  assert.match(out, /\bB\b/);
});

test('разрешение конфликта не съедает пустую строку перед следующим абзацем', () => {
  const text = 'Начало.\n\n<<<<<<< HEAD\nМоя.\n||||||| base\nБыло.\n=======\nЧужая.\n>>>>>>> origin/master\n\nВзять: термос.';
  assert.equal(resolveRegion(text, 0, 'ours'), 'Начало.\n\nМоя.\n\nВзять: термос.');
  assert.equal(resolveRegion(text, 0, 'theirs'), 'Начало.\n\nЧужая.\n\nВзять: термос.');
  assert.equal(resolveRegion(text, 0, 'both'), 'Начало.\n\nМоя.\n\nЧужая.\n\nВзять: термос.');
  assert.equal(resolveConflictMarkers(text, 'ours'), 'Начало.\n\nМоя.\n\nВзять: термос.');
});

test('«обе» для пунктов списка оставляет один список', () => {
  const text = '<<<<<<< HEAD\n- молоко\n=======\n- хлеб\n>>>>>>> origin/master\n- кофе';
  assert.equal(resolveRegion(text, 0, 'both'), '- молоко\n- хлеб\n- кофе');
});
