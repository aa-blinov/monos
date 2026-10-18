import fs from 'fs';
import path from 'path';
import { NOTES_DIR } from './config.js';

// Files an agent reads before it works in a folder: Codex and most agents read AGENTS.md, Claude Code reads
// CLAUDE.md, Gemini CLI reads GEMINI.md. They sit at the top of the notes folder and are not notes: the index
// (and so the board, the tree and search) skips them.
export const AGENT_RULE_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];

export function isAgentRuleFile(fullPath) {
  return path.dirname(fullPath) === NOTES_DIR && AGENT_RULE_FILES.includes(path.basename(fullPath));
}

export const AGENTS_MD = `# Working in this notes folder

This folder is a Monos notes vault: plain Markdown files that a person reads and edits in the Monos app,
and that are synced between their devices through a Git repository. Keep every file valid, portable Markdown.
The full guide, with how to create, link, rename and find notes, is \`.claude/skills/monos-notes/SKILL.md\`
(a skill that Claude Code and OpenCode load by themselves): read it before you change notes.

## Notes

- One note is one \`.md\` file. The file name (without \`.md\`) is the note's title; renaming the file renames
  the note. Folders are the person's folders; \`Daily/\` holds one note per day, \`Quick Notes/\` quick captures.
- A note may start with YAML frontmatter between \`---\` lines:
  - \`title: "…"\` — the title, normally the same as the file name.
  - \`tags: ["work", "ideas"]\` — a list, written inline like this.
  - \`due: 2026-12-01\` — a due date, \`YYYY-MM-DD\`.
  - \`pinned: true\` — kept at the top of the board.
  - \`aliases: [...]\` — other names that link here.
  - Any other key is a custom property (\`status: done\`, \`priority: 2\`, \`owners: [Ann, Bo]\`).
  Change only the keys you mean to change; keep the others, their order and their spelling.
- Link notes with \`[[Note name]]\`, \`[[Note name#Heading]]\` or \`[[Note name|shown text]]\`. Rename a note only
  by renaming its file, and then update the links to it.
- Images and files a note shows live in an \`_attachments/\` folder next to it and are linked with relative paths.
- Callouts are quotes that start with \`> [!note] Title\` (also \`tip\`, \`warning\`, …).
- Tasks are \`- [ ] task\` and \`- [x] done\`.

## Do not

- Do not open or change a note whose frontmatter has \`monos-locked: true\`: its text is encrypted, and any edit
  destroys it.
- Do not touch \`.git/\`, \`.monos/\` or \`.gitattributes\`, and do not run git commands that rewrite history
  or push: Monos syncs the folder itself.
- Do not leave merge-conflict markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`) in a note.
- Do not delete notes unless asked to; prefer moving them.

## Language

Write in the language of the note you are editing, and in the person's language for new notes.
`;

export const CLAUDE_MD = `@AGENTS.md
`;

export const GEMINI_MD = `@AGENTS.md
`;

const CONTENT = { 'AGENTS.md': AGENTS_MD, 'CLAUDE.md': CLAUDE_MD, 'GEMINI.md': GEMINI_MD };

export function agentRulesStatus() {
  return Object.fromEntries(AGENT_RULE_FILES.map((name) => [name, fs.existsSync(path.join(NOTES_DIR, name))]));
}

/** Writes the rule files that are missing. A file that is there, even edited by the person, is left as it is. */
export function ensureAgentRules() {
  const created = [];
  for (const name of AGENT_RULE_FILES) {
    const file = path.join(NOTES_DIR, name);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, CONTENT[name], 'utf8');
    created.push(name);
  }
  return created;
}
