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

Optional grouping label, usually matching the folder where the note lives.

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

Link to another note by title:

```markdown
See [[Project Ideas]] for related thoughts.
```

Monos indexes wiki links and displays backlinks in the editor.

## Storage

Frontmatter is part of the Markdown file and remains portable. The SQLite database only caches parsed metadata and can be rebuilt from the files.
