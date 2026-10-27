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
    assert.ok(['mono', 'sans', 'serif', 'display', 'system'].includes(opt.category), `unexpected category ${opt.category}`);
  }
  // Medeo Sans обязателен — это дефолт в stores.js, Medeo Mono остаётся для кода
  assert.ok(fontOptions.some((o) => o.name === 'Medeo Sans'));
  assert.ok(fontOptions.some((o) => o.name === 'Medeo Mono'));
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

test('applyTypographyVars: шрифт ищется по имени, а не по вхождению в чужое семейство (Roboto не становится System)', async () => {
  const { applyTypographyVars } = await import('./app-shell.js');
  const props = {};
  globalThis.document = { documentElement: { style: { setProperty: (key, value) => { props[key] = value; } } } };
  const base = { lineHeight: 'normal', contentWidth: 'wide', editorFontSize: 'md', fontSize: 'medium', lineHeightOptions: [], contentWidthOptions: [], editorFontSizeOptions: [], fontSizeOptions: [], fontOptions };
  applyTypographyVars({ ...base, fontFamily: 'Roboto' });
  assert.match(props['--font-family'], /^"Roboto"/);
  applyTypographyVars({ ...base, fontFamily: 'System' });
  assert.match(props['--font-family'], /^system-ui/);
  delete globalThis.document;
});
