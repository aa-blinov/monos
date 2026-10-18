import fs from 'fs';
import path from 'path';
import { NOTES_DIR } from './config.js';

// The guide an assistant gets with every notes folder: how to work with Monos notes as the app expects them
// (names, front matter, links, tags, attachments, what not to touch). It is a Claude Code skill
// (.claude/skills/<name>/SKILL.md, which OpenCode reads too); the rule files (AGENTS.md and the others) point
// to it, so an agent that does not load skills can read it as a file. It is made when the server starts, for
// every notes folder, and is never overwritten: a person who edits it keeps their version. It stays on the
// computer it was made on: every device makes its own, so it is kept out of the synced repository (a second
// device that connects would otherwise meet a copy of its own file, and two versions would conflict).
export const AGENT_SKILL_NAME = 'monos-notes';
export const AGENT_SKILL_PATH = path.join('.claude', 'skills', AGENT_SKILL_NAME, 'SKILL.md');
const EXCLUDE_LINE = '.claude/skills/monos-notes/';

export const SKILL_MD = `---
name: monos-notes
description: "Create, edit, find, link and organize notes in a Monos notes folder (plain Markdown files with YAML frontmatter and [[wiki links]]). Use it whenever a task touches the notes here: writing or changing a note, linking notes, tags, properties, due dates, daily notes, renaming or moving, or answering a question from the notes."
metadata:
  monos-skill-version: 1
---

# Working with Monos notes

This folder is a Monos vault. A person reads and edits these files in the Monos app (which also builds a board,
a link map and search from them) and Monos syncs the folder between their devices through Git. What you write
must stay valid, portable Markdown that opens the same in Monos, in any editor and in \`git diff\`.

## How the app sees your changes

- Monos watches the folder: a note you write appears on the board and in the tree within a moment, and an open
  note refreshes. You do not need to tell the app anything.
- What you change is shown to the person for review (a blue "Agent" label on the note, "Agent changes" in the
  terminal). They can keep or revert each file, so make small, clear edits and say what you changed.
- Opening a note in the app does not rewrite its file. Editing it there does: the visual editor writes Markdown in
  one tidy form (see "Write it the way the editor does"), so write that form yourself and diffs stay small.

## Find things

- A note is one \`.md\` file. Its **file name without \`.md\` is its name**; folders are the person's own.
  Search with \`rg\` or \`grep\` over the folder; \`ls -t\` shows what changed last.
- Front matter holds the structure: \`tags: [work, ideas]\`, \`due: 2026-12-01\`, \`aliases: [Other name]\`,
  \`pinned: true\`, any custom property (\`status: done\`, \`priority: 2\`).
  Find by tag: \`rg -l '^tags:.*\\bwork\\b'\`. By property: \`rg -l '^status: done'\`.
- Hidden folders are not notes: skip \`.git/\`, \`.monos/\`, \`.claude/\` and any folder starting with a dot. Files at
  the top such as \`AGENTS.md\`, \`CLAUDE.md\`, \`GEMINI.md\` are instructions, not notes. \`_attachments/\` holds files.

## Create a note

1. Pick the folder and a **file name** that is the note's name. Forbidden characters: \`< > : " / \\ | ? *\` and
   control characters; the name must not end with a dot or a space, must not be a reserved Windows name (\`CON\`,
   \`NUL\`, \`COM1\`…) and stays under 255 bytes. Keep names readable: the name is what people see and link.
2. Do not overwrite: if the file exists, choose another name or append to the note.
3. Start with front matter, then the text:

\`\`\`markdown
---
title: Meeting with Ann
tags: [work, meetings]
---

# Meeting with Ann

- [ ] send the notes
\`\`\`

\`title\` equals the file name. Daily notes live in \`Daily/\` and are named "Daily 2026-10-14" (in Russian
"Daily 14.10.2026"); quick captures go to \`Quick Notes/\`.

## Edit a note

- Change only what the task needs. Keep the front matter keys, their order and spelling, and every \`[[link]]\`.
- Do not reflow, re-wrap or "clean up" text you were not asked to touch. Keep line endings as \`\\n\`.
- Do not paste raw HTML or comments unless the note already has them: a note with HTML opens in Monos as source
  text, because the visual editor cannot keep tags.
- Never leave merge-conflict markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`) in a note.

## Write it the way the editor does

Headings with \`#\`; bullets with \`-\` (two spaces per nesting level); numbered lists as \`1.\`; \`**bold**\` and
\`*italic*\`; dividers as \`---\`; tables with \`| --- |\` separators; code in fences; inline links as
\`[text](url)\`. Tasks are \`- [ ]\` and \`- [x]\`. Callouts are quotes that start \`> [!note] Title\` (\`tip\`,
\`warning\`…). Math is \`$x$\` and \`$$…$$\`; diagrams are fenced code blocks tagged \`mermaid\`.

## Links between notes

- Forms: \`[[Note]]\`, \`[[Note|shown text]]\`, \`[[Note#Heading]]\`, \`[[Folder/Note]]\`; embeds \`![[Note]]\`
  (read-only) and \`![[file.pdf]]\`.
- A link finds a note by its **file name, its \`title\` or one of its \`aliases\`**. Spaces and capitals count; the
  match is exact. If two notes share a name the link is ambiguous: use \`[[Folder/Note]]\`.
- Before you link, check the target exists. A link to nothing is shown as missing (and offered for creation), so
  link to a note you create in the same change, or say that it is a stub.
- **Backlinks** (what points here): \`rg -n '\\[\\[Note name(\\||#|\\]\\])'\`. Notes that **mention** a name without a link
  are worth linking when it helps the reader; do it only when asked or clearly useful.
- Links form the map: a note's *outgoing* links are the \`[[…]]\` it contains, its *incoming* links are the notes
  that contain \`[[its name]]\`. Notes with neither are orphans.

## Rename, move, delete

- Renaming a note in the app updates every link to it. **On disk you must do it yourself**: rename the file, then
  update each \`[[old name]]\`, \`[[old name|…]]\` and \`[[old name#…]]\` in other notes (find them with \`rg\`), and
  \`title:\` if it matched. A note's images sit in its \`_attachments/\` folder: move that folder's files with it.
- Moving between folders keeps the name; links by name still work, links written as \`[[Folder/Note]]\` do not.
- Do not delete notes unless asked; prefer moving them. Deleting in the app goes to a trash; deleting a file does not.

## Attachments

Images and files that a note shows live in an \`_attachments/\` folder next to the note and are linked with
relative paths: \`![alt](_attachments/name.webp)\` or \`![[name.webp]]\`. Do not hotlink or inline large binaries.

## Do not

- Do not open or change a note whose front matter has \`monos-locked: true\`: its text is encrypted, and any edit
  destroys it.
- Do not touch \`.git/\`, \`.monos/\` or \`.gitattributes\`, and do not run git commands that rewrite history or push:
  Monos syncs the folder itself.
- Do not add files to the top of the folder other than the instructions already there.

## Before you finish

- Every file name is valid and every new note has front matter with a \`title\`.
- Every \`[[link]]\` you wrote points at a note that exists (or you said it does not yet).
- No conflict markers, no stray files, no changes outside what was asked.
- Tell the person which notes you created or changed, in their language; write each note in the language it already
  uses, and new ones in the person's language.
`;

export function agentSkillStatus() {
  return fs.existsSync(path.join(NOTES_DIR, AGENT_SKILL_PATH));
}

/**
 * Keeps the skill out of the synced repository, on this computer only: a line in `.git/info/exclude`, which git
 * reads but never commits (a `.gitignore` the person owns is left alone, and an older repository gets the line too).
 * Does nothing when the folder is not a repository yet; connecting sync calls this again.
 * @returns {boolean} whether a line was added
 */
export function excludeAgentSkillFromGit(dir = NOTES_DIR) {
  const gitDir = path.join(dir, '.git');
  if (!fs.existsSync(gitDir)) return false;
  const file = path.join(gitDir, 'info', 'exclude');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (text.split(/\r?\n/).some((line) => line.trim() === EXCLUDE_LINE)) return false;
  fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${EXCLUDE_LINE}\n`, 'utf8');
  return true;
}

/** Writes the skill if it is missing. A file that is there, even edited by the person, is left as it is. */
export function ensureAgentSkill() {
  excludeAgentSkillFromGit();
  const file = path.join(NOTES_DIR, AGENT_SKILL_PATH);
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, SKILL_MD, 'utf8');
  return true;
}
