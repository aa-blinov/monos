import test from 'node:test';
import assert from 'node:assert/strict';
import { calloutMarker, calloutTone, unescapeCalloutMarkers } from './callouts.js';

test('редактор экранирует [ метки выноски; при сохранении скобки возвращаются, обычные экраны не трогаются', () => {
  assert.equal(
    unescapeCalloutMarkers('> \\[!warning\\] Осторожно\n> текст\n\nСсылка \\[так\\] и \\[!x\\] в тексте'),
    '> [!warning] Осторожно\n> текст\n\nСсылка \\[так\\] и \\[!x\\] в тексте',
  );
  assert.equal(unescapeCalloutMarkers('> > \\[!note\\]'), '> > [!note]');
});

test('метка выноски: тип без учёта регистра, заголовок — остаток строки', () => {
  assert.deepEqual(calloutMarker('[!warning] Осторожно'), { type: 'warning', title: 'Осторожно' });
  assert.deepEqual(calloutMarker('[!NOTE]'), { type: 'note', title: '' });
  assert.deepEqual(calloutMarker('[!tip]+ Свёрнуто по умолчанию'), { type: 'tip', title: 'Свёрнуто по умолчанию' });
  assert.deepEqual(calloutMarker('[!info]- Скрыто'), { type: 'info', title: 'Скрыто' });
});

test('обычная цитата и текст со скобками выносками не считаются', () => {
  assert.equal(calloutMarker('Обычная цитата'), null);
  assert.equal(calloutMarker('[см. ниже] текст'), null);
  assert.equal(calloutMarker(null), null);
});

test('тон выноски: советы зелёные, предупреждения жёлтые, ошибки красные, остальное нейтральное', () => {
  assert.equal(calloutTone('tip'), 'green');
  assert.equal(calloutTone('warning'), 'yellow');
  assert.equal(calloutTone('danger'), 'red');
  assert.equal(calloutTone('note'), 'neutral');
});
