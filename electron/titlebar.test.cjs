const test = require('node:test');
const assert = require('node:assert/strict');
const { TITLEBAR_HEIGHT, hasCustomTitleBar, overlayColors, titleBarOptions } = require('./titlebar.cjs');

test('macOS and Windows hide the system bar, Linux keeps its frame', () => {
  assert.equal(hasCustomTitleBar('darwin'), true);
  assert.equal(hasCustomTitleBar('win32'), true);
  assert.equal(hasCustomTitleBar('linux'), false);
  assert.deepEqual(titleBarOptions('linux'), {});
});

test('macOS keeps the traffic lights, centred in the strip', () => {
  const options = titleBarOptions('darwin');
  assert.equal(options.titleBarStyle, 'hidden');
  assert.equal(options.trafficLightPosition.x, 16);
  assert.equal(options.trafficLightPosition.y, (TITLEBAR_HEIGHT - 14) / 2);
  assert.equal(options.titleBarOverlay, undefined);
});

test('Windows keeps its native buttons, as tall as the strip and in the theme colours', () => {
  const options = titleBarOptions('win32', { color: 'rgb(40, 40, 40)', symbolColor: '#ebdbb2' });
  assert.equal(options.titleBarStyle, 'hidden');
  assert.deepEqual(options.titleBarOverlay, { color: 'rgb(40, 40, 40)', symbolColor: '#ebdbb2', height: TITLEBAR_HEIGHT });
});

test('a colour that is not a colour falls back to the dark theme', () => {
  assert.deepEqual(overlayColors({ color: 42, symbolColor: 'red; x' }), { color: '#282828', symbolColor: '#ebdbb2' });
  assert.deepEqual(overlayColors(undefined), { color: '#282828', symbolColor: '#ebdbb2' });
});
