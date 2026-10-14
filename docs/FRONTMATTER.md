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

## Storage

Frontmatter is part of the Markdown file and remains portable. The SQLite database only caches parsed metadata and can be rebuilt from the files.
