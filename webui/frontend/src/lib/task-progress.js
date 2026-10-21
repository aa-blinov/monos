// Progress of the task list inside a single note.
//
// Counting happens on the Markdown source, not on the editor DOM: both editors
// (TipTap and the plain source view) write the same `- [ ]` / `- [x]` syntax,
// so one parser serves both and the number cannot drift from what is saved.

const TASK_LINE = /^[ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]+\[([ xX])\]/;

// Inline code and fenced blocks hold example checklists; counting them would
// report progress the note author never wrote.
const FENCE = /^[ \t]*(?:`{3,}|~{3,})/;

export function taskProgress(markdown) {
  const result = { total: 0, done: 0, percent: 0, isComplete: false };
  if (typeof markdown !== 'string' || markdown === '') return result;

  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = TASK_LINE.exec(line);
    if (!match) continue;
    result.total += 1;
    if (match[1] !== ' ') result.done += 1;
  }

  result.percent = result.total === 0 ? 0 : Math.round((result.done / result.total) * 100);
  result.isComplete = result.total > 0 && result.done === result.total;
  return result;
}

export function formatTaskProgress(progress, strings) {
  if (!progress || progress.total === 0) return '';
  return `${progress.done}/${progress.total}, ${strings.percent(progress.percent)}`;
}
