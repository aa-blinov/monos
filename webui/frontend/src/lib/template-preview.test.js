import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { extractTemplateMetadata, normalizeEmptyListItems } from './template-preview.js';

test('extracts metadata from typical project-brief template', () => {
  const md = `# Project Brief

Created: 2026-08-14
Status: Draft
Owner:

## Outcome
What should be true when this project is done?
`;
  const { metadata, rest } = extractTemplateMetadata(md);
  assert.equal(metadata.length, 3, 'должно быть 3 поля');
  assert.equal(metadata[0].label, 'Created');
  assert.equal(metadata[0].value, '2026-08-14');
  assert.equal(metadata[1].label, 'Status');
  assert.equal(metadata[1].value, 'Draft');
  assert.equal(metadata[2].label, 'Owner');
  assert.equal(metadata[2].value, '');
  assert.ok(rest.startsWith('## Outcome'), 'rest должен начинаться с секции');
  assert.match(rest, /What should be true/);
});

test('returns empty metadata when template has only H1 + sections', () => {
  const md = `# Topic / MOC

## Overview
- 
`;
  const { metadata, rest } = extractTemplateMetadata(md);
  assert.equal(metadata.length, 0);
  assert.match(rest, /## Overview/);
});

test('handles empty string', () => {
  const { metadata, rest } = extractTemplateMetadata('');
  assert.equal(metadata.length, 0);
  assert.equal(rest, '');
});

test('handles null and undefined gracefully', () => {
  assert.deepEqual(extractTemplateMetadata(null).metadata, []);
  assert.deepEqual(extractTemplateMetadata(undefined).metadata, []);
  assert.equal(extractTemplateMetadata(null).rest, '');
});

test('preserves field labels with multiple words like "Date" or "Project"', () => {
  const md = `# Meeting Notes

Date: 2026-08-14
Time: 14:00
Project: Monos
Participants:
`;
  const { metadata } = extractTemplateMetadata(md);
  assert.equal(metadata.length, 4);
  assert.equal(metadata[0].label, 'Date');
  assert.equal(metadata[1].label, 'Time');
  assert.equal(metadata[2].label, 'Project');
  assert.equal(metadata[3].label, 'Participants');
  assert.equal(metadata[2].value, 'Monos');
});

test('field value may contain colons (e.g. URL)', () => {
  const md = `# Research

URL: https://example.com/page
Date: 2026-01-01
`;
  const { metadata } = extractTemplateMetadata(md);
  assert.equal(metadata[0].label, 'URL');
  assert.equal(metadata[0].value, 'https://example.com/page');
  assert.equal(metadata[1].label, 'Date');
});

test('stops reading metadata at first non Label: value line', () => {
  const md = `# Mixed

Created: 2026-08-14
This is not a metadata line
Status: Draft
`;
  const { metadata, rest } = extractTemplateMetadata(md);
  assert.equal(metadata.length, 1, 'должно остановиться на не-метаданной строке');
  assert.equal(metadata[0].label, 'Created');
  assert.match(rest, /This is not a metadata line/);
});

test('tolerates missing H1', () => {
  const md = `Created: 2026-08-14
Status: Draft

## Outcome
- 
`;
  const { metadata, rest } = extractTemplateMetadata(md);
  assert.equal(metadata.length, 2);
  assert.match(rest, /## Outcome/);
});

test('tolerates H1 without blank line before metadata', () => {
  const md = `# Title
Created: 2026-08-14
Status: Draft

## Section
`;
  const { metadata, rest } = extractTemplateMetadata(md);
  assert.equal(metadata.length, 2);
  assert.match(rest, /## Section/);
});

test('empty numbered and bulleted items keep their marker', () => {
  assert.equal(normalizeEmptyListItems('1. \n2. \n3. '), '1.\n2.\n3.');
  assert.equal(normalizeEmptyListItems('- \n- '), '-\n-');
  assert.equal(normalizeEmptyListItems('1. First step\n2. '), '1. First step\n2.');
});

test('lines that are not empty items stay as they are', () => {
  assert.equal(normalizeEmptyListItems('- [ ] Task '), '- [ ] Task ');
  assert.equal(normalizeEmptyListItems('Plain line  '), 'Plain line  ');
  assert.equal(normalizeEmptyListItems('---'), '---');
  assert.equal(normalizeEmptyListItems(null), '');
});

test('an empty numbered list renders as an ordered list, not a paragraph', () => {
  const html = marked.parse(normalizeEmptyListItems('## Next Week Priorities\n1. \n2. \n3. '));
  assert.match(html, /<ol>/);
  assert.equal((html.match(/<li><\/li>/g) || []).length, 3);
  assert.doesNotMatch(html, /<p>1\./);
});
