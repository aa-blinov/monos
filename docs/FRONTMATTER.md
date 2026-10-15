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

## Storage

Frontmatter is part of the Markdown file and remains portable. The SQLite database only caches parsed metadata and can be rebuilt from the files.
