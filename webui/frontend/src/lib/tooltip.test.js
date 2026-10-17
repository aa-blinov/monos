import test from 'node:test';
import assert from 'node:assert/strict';
import { hintOf, placeTooltip, tooltipClass, TOOLTIP_GAP, VIEWPORT_MARGIN } from './tooltip.js';

const viewport = { width: 1000, height: 800 };
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test('короткая подпись — капитель, предложение переносится строчными', () => {
  assert.match(tooltipClass('Trash'), /uppercase/);
  assert.match(tooltipClass('Every note with its own fields in one table.'), /normal-case/);
  assert.match(tooltipClass('Trash'), /rounded-ui/);
});

test('под элементом по центру, у нижнего края — над ним, у правого — внутри окна', () => {
  const tip = { width: 100, height: 30 };
  assert.deepEqual(placeTooltip(rect(400, 100, 40, 20), tip, viewport), { left: 370, top: 120 + TOOLTIP_GAP });
  assert.equal(placeTooltip(rect(400, 780, 40, 20), tip, viewport).top, 780 - 30 - TOOLTIP_GAP);
  assert.equal(placeTooltip(rect(980, 100, 20, 20), tip, viewport).left, 1000 - 100 - VIEWPORT_MARGIN);
});

test('справа от строки дерева, по её середине; нет места справа — слева', () => {
  const tip = { width: 200, height: 30 };
  assert.deepEqual(placeTooltip(rect(10, 100, 250, 28), tip, viewport, { position: 'right' }), { left: 260 + TOOLTIP_GAP, top: 99 });
  assert.equal(placeTooltip(rect(700, 100, 250, 28), tip, viewport, { position: 'right' }).left, 700 - 200 - TOOLTIP_GAP);
});

test('подсказка берётся у ближайшего элемента с title или data-tooltip', () => {
  const attrs = (map) => ({ getAttribute: (name) => map[name] ?? null });
  const owner = attrs({ title: '  Sync now ' });
  assert.deepEqual(hintOf({ closest: () => owner }), { element: owner, text: 'Sync now' });
  assert.equal(hintOf({ closest: () => attrs({ title: '   ' }) }), null);
  assert.equal(hintOf({ closest: () => null }), null);
  assert.equal(hintOf(null), null);
});
