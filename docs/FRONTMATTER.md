# Note Frontmatter

Monos stores notes as Markdown files. Optional YAML frontmatter at the top of a note provides metadata for search, filtering, and display.

## Example

```yaml
---
title: Project Ideas
tags: [planning, product]
category: Work
---
```

## Fields

### `title`

Human-readable note title.

```yaml
title: Reading List
```

If omitted, Monos falls back to the file name.

### `tags`

A list of short labels.

```yaml
tags: [research, design, draft]
```

Use lowercase words when possible. Prefer a small number of useful tags over long tag lists.

### `category`

Optional grouping label, usually matching the folder where the note lives. In the note's properties it is the Category field; it does not move the file. The field suggests categories that already exist in the notes, and a name typed in a different case reuses the existing spelling.

```yaml
category: Projects
```

### `aliases`

Other names that link to this note, as a list or a single value. `[[Espresso]]` opens the note that has `aliases: [Espresso]`, and `[[Espresso#Ingredients]]` points at its "Ingredients" heading. Monos only reads aliases; saving the note writes them back as they were.

```yaml
aliases: [Espresso, "Кофе"]
```

### Custom properties

Any other top-level key is a property of the note. Its type comes from how the value is written:

- `priority: 3` is a number, `due: 2026-12-01` a date, `done: true` (or `yes` / `no`) a checkbox;
- `owners: [Ann, Bo]` or a block list is a list;
- anything else, and any value in quotes, is text.

The Properties panel in the editor edits them, and each change is written to the frontmatter line by line: the other lines, their order and the body stay as they were. `title`, `tags`, `category`, `pinned` and `aliases` belong to the app and cannot be used as property names.

Search filters by properties: `prop:status` (the property is there), `prop:status=done`, `prop:priority>=3`, `prop:due<2026-12-01`, and `-prop:status=done` leaves those notes out. The Properties entry in the sidebar opens the notes as a table: choose the columns, sort by any of them, and filter with the same syntax.

## Body

The note body starts after the closing `---`.

```markdown
---
title: Meeting Notes
tags: [meeting]
---

## Summary

Write the note here.
```

## Wiki Links

Link to another note by its title or its file name:

```markdown
See [[Project Ideas]] for related thoughts.
```

Monos indexes wiki links and displays backlinks in the editor. Renaming a note rewrites the `[[old name]]` links to it in other notes, and links inside code are left alone. Renaming an image attachment updates its image references in the same way. Moving a note to another folder does not affect its links, because they match names rather than paths. If another note still has the old name, the links stay as they are, so they never switch to a different note.

A link can point at a heading, `[[Name#Heading]]`, and it counts as a link to `Name`: it shows in the backlinks, and renaming `Name` keeps the heading. A name with `#` in it, such as `Issue #42`, still resolves by its full name.

The Related panel of a note shows the notes that link to it, the notes that name it in plain prose without linking (their **Link** button turns the first such mention into a link), and a small local graph of its neighbours. Settings → Links and notes lists the broken links, the notes that no link reaches, and the notes nobody has opened or edited for 180 days; each row opens its note.

A link can also name a note through its folder, as Obsidian writes it: `[[Projects/Plan]]` finds the note `Plan`, and renaming `Plan` keeps the folder in the link.

### Embeds and callouts

`![[picture.png]]` shows a picture from the note's `_attachments` folder, and `![[Other note]]` embeds another note. `![[document.pdf]]` shows a PDF attachment as a frame of its pages with a link to open it whole. Drop a PDF onto the editor to attach it and embed it where it was dropped; the file goes into `_attachments` next to the note, unconverted.

A quote whose first line is a callout marker, `> [!warning] Title`, is drawn as a callout. The file keeps the quote and its marker as Obsidian writes them. Importing a vault archive skips its hidden folders such as `.obsidian` and `.trash`.

### Locked notes

A note can be locked with a passphrase, and only when its owner asks for it. A locked note is still a note file: its frontmatter says `monos-locked: true`, and the rest of the file is one sealed block (AES-256-GCM, the key derived from the passphrase with scrypt) holding the original text. Nothing of the text is written in plain form until the lock is removed, which is the only way back to plain text. Opening a locked note asks for the passphrase; the note then stays open for the session, and a restart asks again.

While a note is locked its text is not indexed, so search does not find it, and it is left out of publishing. Printing needs the note to be open in the session. Links to a locked note from other notes still resolve by name, but a locked note's own links and its attachment references are not rewritten on rename. A lost passphrase cannot be recovered.

## Storage

Frontmatter is part of the Markdown file and remains portable. The SQLite database only caches parsed metadata and can be rebuilt from the files.
