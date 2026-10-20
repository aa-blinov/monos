# Screenshots

The eight pictures of the interface, and where each one comes from.

The files themselves are one folder up, in `site/media/`. The README and
the landing page link to them from there, and the paths are shorter that
way. This folder holds the index.

| Picture | What it shows |
| --- | --- |
| [../../site/media/monos-dashboard.png](../../site/media/monos-dashboard.png) | The board, with the recent notes as cards. |
| [../../site/media/monos-editor.png](../../site/media/monos-editor.png) | The editor, with the outline of the note beside the text. |
| [../../site/media/monos-search.png](../../site/media/monos-search.png) | The search results, with the matching words highlighted. |
| [../../site/media/monos-quick-switcher.png](../../site/media/monos-quick-switcher.png) | The quick switcher, listing the notes and the templates. |
| [../../site/media/monos-conflicts.png](../../site/media/monos-conflicts.png) | The conflict dialog, with the two versions of one note side by side. |
| [../../site/media/monos-templates.png](../../site/media/monos-templates.png) | The template manager. |
| [../../site/media/monos-settings.png](../../site/media/monos-settings.png) | The settings screen. |
| [../../site/media/monos-mobile.png](../../site/media/monos-mobile.png) | The board in a window the size of a phone. |

## How they were taken

`scripts/capture-site-screenshots.mjs` drives the real application. It
starts its own backend on port 8137 and its own Vite server on port 5187,
writes a set of seed notes into a temporary folder, and drives the
interface with Playwright. Nothing of the person who runs the script is
touched: the notes folder is a temporary directory that is removed at the
end.

```bash
node scripts/capture-site-screenshots.mjs
```

The pictures are written into `site/media/`, where the landing page and the
README pick them up.

## The board

The main screen, with the sidebar closed so that the grid of cards takes
the whole width. The picture is cropped to the empty margins around the
board, and the pointer is parked in the left margin so that no card is in
its hover state.

## The editor

A note called "Launch Plan" from the seed set, opened from the tree in
the sidebar. The outline on the left is built from the headings of the
note itself.

## The search results

The word "sync" typed into the search field. The matching words are
highlighted in the excerpts, which are cut from the body of the note
around the match.

## The quick switcher

Opened with the keyboard, `Meta+O` on macOS, and then typed into. The
switcher finds a note by its title, which is the fastest way to reach a
note when its name is known and its place in the tree is not.

## The conflict dialog

Two devices changed the same note, and the app found the conflict. The
dialog shows both versions and asks which one to keep. The picture is
reached from the settings screen, through "View Conflicts" and then
"Resolve Conflicts".

## The template manager

The page that holds the templates, the notes that start a new note when
they are applied.

## The settings

The settings screen, scrolled to the backup section. The theme, the
palette, the sync interval, the agent command and the access switch are
all here.

## The board on a phone-sized window

The same board in a viewport of 390 by 844 pixels, the size of a phone. The layout reflows into a single column of cards.
