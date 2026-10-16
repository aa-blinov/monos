/**
 * Git conflict markers inside a Markdown note.
 *
 * A conflicted merge writes standard markers into the file. They are plain
 * text, and the note stays perfectly valid Markdown — until something parses
 * it. `marked` turns the separator line `=======` into a setext underline, so
 * `<<<<<<< HEAD` plus the next line become an H1, and the `>>>>>>>` label
 * becomes a run of nested blockquotes. Every marker is gone, the structure is
 * fiction, and any save writes that fiction back to disk.
 *
 * Both Joplin and Reflect treat this as a hard rule: a note carrying markers is
 * never opened in the normal editor, because the editor's round-trip cannot
 * represent a merge conflict. This module is how Monos notices the situation.
 */

import { frontmatterEnd, mergeProperties } from './conflict-properties.js';

const START = /^<{7}(?: .*)?$/;
const SEPARATOR = /^={7}$/;
const BASE = /^\|{7}(?: .*)?$/;
const END = /^>{7}(?: .*)?$/;

/**
 * @typedef {{ start: number, end: number, ours: string, theirs: string, base: string }} ConflictRegion
 */

/**
 * Parse conflict regions, with character offsets into the original string.
 *
 * A region is closed only by a `>>>>>>>` line. Anything else — an unterminated
 * block, a stray marker — is not a region, and is left untouched.
 *
 * @param {string} text
 * @returns {ConflictRegion[]}
 */
export function parseConflictRegions(text) {
  const source = String(text || '');
  const lines = source.split('\n');

  // Character offset of each line's first character.
  const offsets = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1;
  }

  const regions = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!START.test(lines[i])) continue;

    // Buckets stay arrays while collecting; an untouched phase is flushed to ''
    // before the region is returned so callers never see [].
    const collected = { ours: [], base: [], theirs: [] };
    let phase = 'ours';
    let closedAt = -1;

    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (SEPARATOR.test(line)) {
        // Flush whichever phase we were collecting — with zdiff3 this is 'base',
        // which must survive into the result.
        collected[phase] = collected[phase].join('\n');
        collected.theirs = [];
        phase = 'theirs';
        continue;
      }
      if (BASE.test(line)) {
        collected[phase] = collected[phase].join('\n');
        collected.base = [];
        collected.theirs = [];
        phase = 'base';
        continue;
      }
      if (END.test(line)) {
        collected[phase] = collected[phase].join('\n');
        closedAt = j;
        break;
      }
      collected[phase].push(line);
    }

    if (closedAt === -1) continue; // unterminated — not a conflict region

    for (const key of ['ours', 'base', 'theirs']) {
      if (Array.isArray(collected[key])) collected[key] = collected[key].join('\n');
    }

    regions.push({
      start: offsets[i],
      // Include the closing marker line, newline included.
      end: offsets[closedAt] + lines[closedAt].length + 1,
      ours: collected.ours,
      theirs: collected.theirs,
      base: collected.base,
    });

    i = closedAt;
  }

  return regions;
}

/**
 * Does this note contain an unresolved merge conflict?
 * @param {string} text
 * @returns {boolean}
 */
export function hasConflictMarkers(text) {
  return parseConflictRegions(text).length > 0;
}

/**
 * A conflict summary for the UI banner.
 * @param {string} text
 * @returns {{ count: number, first: ConflictRegion|null }}
 */
export function summarizeConflicts(text) {
  const regions = parseConflictRegions(text);
  return { count: regions.length, first: regions[0] || null };
}

/**
 * Resolve every conflict region in a document.
 *
 * `choice` is `'ours' | 'theirs' | 'both'`. This runs on the raw text and never
 * goes through the editor, so nothing around the conflict is reinterpreted on
 * the way through.
 *
 * @param {string} text
 * @param {'ours'|'theirs'|'both'} choice
 * @returns {string}
 */
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/**
 * The text that takes a region's place. A region ends with the newline after its closing marker; the
 * replacement gives that newline back, or the paragraph after the conflict would run into it. "Both"
 * keeps the two versions as separate paragraphs (a blank line between), except list items, which stay
 * one list.
 */
function regionReplacement(source, region, choice) {
  let replacement;
  if (choice && typeof choice === 'object') replacement = String(choice.custom ?? '');
  else if (choice === 'ours') replacement = region.ours;
  else if (choice === 'theirs') replacement = region.theirs;
  else if (region.start < frontmatterEnd(source)) {
    // A part inside the properties: both sides merge by key, or two `tags:` lines would break the block.
    replacement = mergeProperties(region.ours, region.theirs) ?? region.ours;
  } else {
    const sides = [region.ours, region.theirs].filter(Boolean);
    const listy = sides.length === 2 && sides.every((side) => LIST_ITEM.test(side));
    replacement = sides.join(listy ? '\n' : '\n\n');
  }
  const consumedNewline = source[region.end - 1] === '\n';
  if (replacement && consumedNewline && !replacement.endsWith('\n')) replacement += '\n';
  return replacement;
}

export function resolveConflictMarkers(text, choice) {
  const source = String(text || '');
  const regions = parseConflictRegions(source);
  if (!regions.length) return source;

  let result = source;
  // Right to left, so earlier offsets stay valid as we splice.
  for (const region of regions.slice().reverse()) {
    result = result.slice(0, region.start) + regionReplacement(result, region, choice) + result.slice(region.end);
  }
  return result;
}
/**
 * Split a conflicted document into alternating plain / conflict segments.
 *
 * A conflicted note must not be re-parsed as Markdown anywhere near a marker,
 * but the surrounding text is ordinary and keeps its formatting. Slicing at the
 * region boundaries gives both: the conflict stays raw, everything around it is
 * rendered normally, and the reader keeps the surrounding paragraph that gives
 * the conflicting lines their meaning.
 *
 * @param {string} text
 * @returns {Array<{ type: 'text'|'conflict', value: any }>}
 */
export function splitByConflicts(text) {
  const source = String(text || '');
  const regions = parseConflictRegions(source);
  if (!regions.length) return [{ type: 'text', value: source }];

  const segments = [];
  let cursor = 0;
  for (const region of regions) {
    if (region.start > cursor) {
      segments.push({ type: 'text', value: source.slice(cursor, region.start) });
    }
    segments.push({ type: 'conflict', value: region });
    cursor = region.end;
  }
  if (cursor < source.length) {
    segments.push({ type: 'text', value: source.slice(cursor) });
  }
  return segments;
}

/**
 * Resolve one conflict region by index, leaving the rest untouched.
 *
 * `choice` may also be `{ custom }`: text the person wrote for this part themselves.
 *
 * @param {string} text
 * @param {number} index
 * @param {'ours'|'theirs'|'both'|{ custom: string }} choice
 * @returns {string}
 */
export function resolveRegion(text, index, choice) {
  const source = String(text || '');
  const regions = parseConflictRegions(source);
  const region = regions[index];
  if (!region) return source;

  return source.slice(0, region.start) + regionReplacement(source, region, choice) + source.slice(region.end);
}
