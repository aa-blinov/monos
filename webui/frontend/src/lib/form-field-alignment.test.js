/**
 * Test that the global input rule in app.css uses the same vertical padding
 * as formFieldClass. Otherwise `input[type="text"]` has higher specificity
 * (0,1,1) than the class-based `py-1.5` (0,1,0) and silently wins, leaving
 * the input with more padding than the select sitting next to it — the
 * underlines then render at different y positions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formFieldClass } from './form-field.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appCssPath = join(__dirname, '..', 'app.css');
const appCss = readFileSync(appCssPath, 'utf8');

function extractPaddingFromRule(ruleText) {
  // ищем @apply ... py-N ...
  const m = ruleText.match(/py-(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

test('formFieldClass использует py-1.5 (6px) для вертикального padding', () => {
  const cls = formFieldClass();
  // py-1.5 → 0.375rem → 6px при базовом шрифте 16px
  assert.match(cls, /py-1\.5/, 'helper должен фиксировать py-1.5');
});

test('app.css глобальное правило input[type="text"] использует тот же py, что и helper', () => {
  // Ищем блок с input[type="text"], textarea
  const blockMatch = appCss.match(/input\[type="text"\][\s\S]*?textarea\s*\{[\s\S]*?\}/);
  assert.ok(blockMatch, 'в app.css должно быть правило для input[type="text"], textarea');
  const block = blockMatch[0];
  const rulePadding = extractPaddingFromRule(block);
  assert.ok(rulePadding, 'блок должен содержать @apply ... py-N ...');
  // Глобальное правило должно использовать ТОТ ЖЕ py, что и formFieldClass,
  // иначе из-за specificity (0,1,1) > (0,1,0) input перекроет helper
  // и underline съедет относительно select.
  assert.equal(
    rulePadding,
    '1.5',
    `app.css: input[type="text"] использует py-${rulePadding}, а helper ожидает py-1.5 — из-за разной specificity input получит другое вертикальное padding, чем select, и underlines не совпадут по y`,
  );
});

test('textarea использует тот же py, что и input[type="text"] (одинаковая высота)', () => {
  const block = appCss.match(/input\[type="text"\][\s\S]*?textarea\s*\{[\s\S]*?\}/)[0];
  // внутри блока — одно правило с двумя селекторами; py должно быть одно
  const paddingMatches = [...block.matchAll(/py-(\d+(?:\.\d+)?)/g)].map((m) => m[1]);
  assert.ok(paddingMatches.length >= 1);
  // все py в блоке должны быть одинаковыми
  const unique = new Set(paddingMatches);
  assert.equal(unique.size, 1, 'в одном @apply блоке не должно быть разных py-N значений');
});
