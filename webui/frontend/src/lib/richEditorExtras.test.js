import test from 'node:test';
import assert from 'node:assert/strict';
import { InlineMath, MathBlock, MermaidBlock, NoteEmbed } from './richEditorExtras.js';

// TipTap tells the nodes apart by these names, so renaming one silently breaks
// every note that already uses it.
test('узлы формул, диаграмм и вложенных заметок сохраняют свои имена', () => {
  assert.deepEqual(
    [InlineMath, MathBlock, MermaidBlock, NoteEmbed].map((node) => node.name),
    ['inlineMath', 'mathBlock', 'mermaidBlock', 'noteEmbed'],
  );
});
