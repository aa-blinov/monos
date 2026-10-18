import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fontOptions,
  fontSizeOptions,
  lineHeightOptions,
  contentWidthOptions,
  editorFontSizeOptions,
} from './fonts.js';

test('fontOptions содержит известные семейства с категориями', () => {
  assert.ok(Array.isArray(fontOptions));
  assert.ok(fontOptions.length >= 4);
  for (const opt of fontOptions) {
    assert.ok(opt.name);
    assert.ok(opt.family);
    assert.ok(['mono', 'sans', 'serif', 'system'].includes(opt.category), `unexpected category ${opt.category}`);
  }
  // JetBrains Mono обязателен — это дефолт в stores.js
  assert.ok(fontOptions.some((o) => o.name === 'JetBrains Mono'));
});

test('fontSizeOptions покрывает small/medium/large', () => {
  const values = fontSizeOptions.map((o) => o.value);
  assert.ok(values.includes('small'));
  assert.ok(values.includes('medium'));
  assert.ok(values.includes('large'));
});

test('lineHeightOptions покрывает compact/cozy/normal/spaced/relaxed', () => {
  const values = lineHeightOptions.map((o) => o.value);
  assert.ok(values.length >= 5);
  assert.ok(values.includes('compact'));
  assert.ok(values.includes('cozy'));
  assert.ok(values.includes('normal'));
  assert.ok(values.includes('spaced'));
  assert.ok(values.includes('relaxed'));
});

test('contentWidthOptions включает medium/wide', () => {
  const values = contentWidthOptions.map((o) => o.value);
  assert.ok(values.includes('medium'));
  assert.ok(values.includes('wide'));
});

test('editorFontSizeOptions покрывает xs/sm/md/lg', () => {
  const values = editorFontSizeOptions.map((o) => o.value);
  assert.ok(values.includes('xs'));
  assert.ok(values.includes('sm'));
  assert.ok(values.includes('md'));
  assert.ok(values.includes('lg'));
});

test('fontOptions: есть системный шрифт, и он находится по имени', () => {
  const system = fontOptions.find((o) => o.name === 'System');
  assert.ok(system);
  assert.match(system.family, /^system-ui/);
});
