---
name: Monos
description: A calm notes app that does not trap your knowledge.
colors:
  paper-warm: "#fbf1c7"
  paper-shade: "#ebdbb2"
  paper-deep: "#d5c4a1"
  ink: "#3c3836"
  ink-soft: "#7c6f64"
  ink-faint: "#928374"
  rule: "#d5c4a1"
  night-warm: "#282828"
  night-shade: "#3c3836"
  night-deep: "#504945"
  parchment: "#ebdbb2"
  parchment-soft: "#a89984"
  clay-red: "#fb4934"
  ember-orange: "#fe8019"
  ochre-yellow: "#fabd2f"
  olive-green: "#b8bb26"
  sage-aqua: "#8ec07c"
  slate-blue: "#83a598"
  mauve-purple: "#d3869b"
typography:
  display:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0.12em"
rounded:
  none: "0px"
  ui: "6px"
  full: "9999px"
spacing:
  hair: "2px"
  tight: "4px"
  snug: "8px"
  base: "12px"
  comfortable: "16px"
  roomy: "24px"
  section: "32px"
  field: "6px"
  input: "10px"
components:
  button-primary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "uppercase, 0.1em tracking, 700"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "uppercase, 0.1em tracking, 400"
    padding: "8px 16px"
  button-minimal:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "14px, 500"
    padding: "8px 16px"
  card-note:
    backgroundColor: "{colors.paper-warm}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ui}"
    padding: "16px"
  field-underline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "32px"
  chip-tag:
    backgroundColor: "{colors.paper-warm}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.ui}"
    padding: "2px 8px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.ui}"
    size: "36px"
  modal-panel:
    backgroundColor: "{colors.paper-warm}"
    textColor: "{colors.ink}"
    rounded: "{rounded.ui}"
    padding: "32px"
    width: "384px"
---

# Design system: Monos

## Overview

**Creative North Star: "Стол с разложенными карточками"** (A desk with cards laid out)

Monos looks like a desk under warm light. Notes are cards laid out on it, each one with its own tint, its own label, its own place in the stack. Nothing is "UI" pretending to be paper; the paper is warm because the palette is warm, and the layout is orderly because a desk is orderly. The system borrows the calm of a printed page rather than the energy of a tool.

The reading is quiet and typographic. Every note title, tag, date, and control is set in one face at a time: JetBrains Mono unless the person picks another from the font library, because a card index is sorted by legibility, not by personality. The default monospace is the single most characteristic decision here: it says *this is where text lives*, and it makes every string on screen look like it was placed by a person rather than by a component library. The font library lets a person trade that voice for their own reading comfort; the discipline that survives the trade is one face per screen.

Density is moderate and deliberate. Metadata shrinks to `11px` with wide tracking so it whispers; titles sit at `18-24px` and carry the weight. The result is a screen with a clear loud part and a clear quiet part.

Anti-reference, confirmed: **never "designer-made."** The system must not look styled, curated, or displayed. Nothing glows for effect, nothing has a gradient nobody asked for, no surface announces itself as important. The anti-reference is craft without ornament, and where restraint could turn into neglect, the standard is a well-set book, not a barebones tool.

**Key Characteristics:**

- Warm paper and ink, never pure white and never pure black
- One face at a time: JetBrains Mono by default, or the one the person chose from the font library; code always stays in JetBrains Mono
- Metadata whispers at 11px with wide uppercase tracking; its labels step up to 12px
- Flat at rest, lifted only in motion
- Note color arrives as a tint and a soft glow, never as a border
- Square modals, round cards: tension held deliberately

## Colors

The palette is warm, low-chroma, and paper-based: backgrounds are tinted creams and warm greys, never neutral greys, and accents are earthy rather than saturated.

Six palettes ship (Gruvbox, GitHub, Dracula, Nord, Solarized, Catppuccin); **Gruvbox is the default** and defines the reference character. Every color below is a Gruvbox token. All other palettes expose the identical variable contract.

Tokens live as CSS custom properties in `lib/themes.js`, the single source of truth. Components read them (`bg-[var(--bg-primary)]`); components never hardcode a color.

**Code colours are derived, not chosen.** The accent tokens carry tags, borders and icons, never body text, and measured against `--bg-secondary` they fail AA 4.5:1 in most theme/mode pairs (`--yellow` is 1.28:1 on nord light). Using them raw for syntax would have made highlighted code *less* readable than the plain text it replaced. So eight `--code-*` roles (comment, keyword, string, number, function, type, tag, punctuation) take their hue from the matching accent and are walked toward black in light mode, white in dark, until they clear the threshold. Nothing is hand-tuned per theme; the derivation runs over the palettes at load and a test asserts AA across all twelve pairs.

### Primary

- **Warm Paper** (`#fbf1c7`, light) / **Night Warm** (`#282828`, dark), the desk surface itself. Every screen, panel, and card sits on this. It is the app's background and the default card fill; the dark value is the desktop default because `gruvbox` ships in dark mode first.
- **Paper Shade** (`#ebdbb2` / `#3c3836`), the second surface layer: hovered rows, inline code, preformatted blocks, nested panels.
- **Paper Deep** (`#d5c4a1` / `#504945`), the third layer: scrollbar thumbs, blockquote-adjacent fills, anything that needs to sit *above* shade but below ink.

### Secondary

- **Ink** (`#3c3836` / `#ebdbb2`): every readable sentence. The highest-contrast token in the system and the only one allowed at full strength for body copy.
- **Ink Soft** (`#7c6f64` / `#a89984`): supporting text: excerpts, subtitles, secondary labels. Reads as a quieter sentence, never as disabled text.
- **Ink Faint** (`#928374`, both modes): the floor. Timestamps, counts, and de-emphasized chrome.
- **Ink Quiet** (`--text-tertiary`): derived per theme to clear WCAG AA 4.5:1 on a tinted note card. Carries the metadata whisper; see docs/ARCHITECTURE.md.

### Tertiary

Accents are earthy and used sparingly, mostly as state signals rather than decoration:

- **Clay Red** (`#cc241d` / `#fb4934`): destructive actions and error states.
- **Ember Orange** (`#d65d0e` / `#fe8019`): warnings and attention.
- **Ochre Yellow** (`#d79921` / `#fabd2f`): pending, unsaved, in-progress.
- **Olive Green** (`#98971a` / `#b8bb26`): success and completed.
- **Slate Blue** (`#458588` / `#83a598`): links and informational states.
- **Sage Aqua** (`#689d6a` / `#8ec07c`) and **Mauve Purple** (`#b16286` / `#d3869b`): secondary accents and note-color variants.

### Neutral

- **Rule** (`#d5c4a1` / `#504945`), the single border token, shared by `--border-subtle` and the third background layer. Every divider, field underline, card edge, and chip outline uses it.

### Spacing

One 4px grid. Nothing is an arbitrary value, and nothing is off-grid.

| Token | Value | Role |
|---|---|---|
| `hair` | 2px | Icon-to-label, chip padding |
| `field` | 6px | Underline-field padding |
| `tight` | 4px | Inline control padding, chip padding |
| `input` | 10px | Slightly looser inline control |
| `snug` | 8px | Label-to-value, stack inside one control |
| `base` | 12px | Card padding, grid gap between cards |
| `comfortable` | 16px | Gap between sibling blocks, panel padding |
| `roomy` | 24px | Gap between sections inside a surface |
| `section` | 32px | Modal padding, space between page sections |

The rule that keeps this from drifting: **the same role gets the same number
everywhere.** A modal is 32px on all four sides in every dialog; a note card is
12px on all four sides whether it is in the board, the dashboard, or search; a
grid of cards is 16px apart regardless of what the cards are. When a surface
needs more room than its role allows, the role changes (a dialog is a `section`,
a card is a `base`), not the number.

Numbers like 28px, 36px and 40px are not part of this system. They appeared by
accumulation rather than by decision and have been folded back into the grid;
`space-y-7`→24, `space-y-10`→32, `gap-9`→16.

### Control sizes

Every tappable thing sits on the 4px grid with no holes. Measured from the code,
not invented:

| Token | px | Tailwind | Role |
|---|---|---|---|
| `xs` | 24px | `h-6` | inline icon button, colour dot |
| `sm` | 28px | `h-7` | dense rows, segment pills, tree header actions |
| `md` | 32px | `h-8` | editor toolbar |
| `lg` | 36px | `h-9` | default buttons, inputs, modal actions |
| `xl` | 40px | `h-10` | header bar |
| `2xl` | 44px | `h-11` | touch targets, sidebar footer |

There is no "standard button" size, because there was never one: the scale is
six even steps and each component picks by density. What is forbidden is a
number that is not one of these.

### Icon sizes

Four optical sizes, one stroke weight:

| Token | px | Role |
|---|---|---|
| `xs` | 12px | inside text, chips, counters |
| `sm` | 14px | tree rows, inline actions, secondary labels |
| `md` | 16px | default: toolbar, icon buttons, navigation |
| `lg` | 20px | page-level actions |
| `xl` | 24px | rare, large affordances |

`strokeWidth="1.7"` everywhere. A thinner set reads as text, a heavier one as
decoration. Icons may be sized with `size="16"` or with `w-4 h-4`; both are
unambiguous. What matters is that the number is on this list.

### Corner radius

The check in `lib/design-tokens.test.js` finds this section by the heading it
spells like this:

```markdown
  ### Corner Radius
```

It compares the tokens in the table with the scales in the code, so the
spelling of the heading above and the one in the test have to stay in step.

| Token | px | Role |
|---|---|---|
| `none` | 0px | cancelling an inherited radius, e.g. `code` inside `pre`, and field underlines, which are a single border line |
| `ui` | 6px | **the one radius**: every rectangle: cards, modals, panels, menus, tooltips, fields, buttons, tags, chips, checkboxes, inline code |
| `full` | circle | only shapes that are round by nature: colour dots, spinners, theme swatches, the note glow |

**One radius.** Every rectangle in Monos has the same corner, 6px, set once as `--radius` in `app.css` and exposed to Tailwind as `rounded-ui`. A card, a modal, a tag and a checkbox are drawn by the same hand, so a modal over the board, a menu over a card or a chip inside a card never look pasted in from another app. 6px is small on purpose: it reads as a soft corner on a 400px card and still as a square on a 16px checkbox, so one value works at every size.

Changing the corner means changing `--radius`, nothing else.

`rounded-full` is not a corner. It is kept for things that are circles, equal width and height, and for decoration such as the note glow. A tag, a search field or a segmented control is a rectangle and takes `rounded-ui` like everything else.

### Enforced, not just documented

`webui/frontend/src/lib/design-tokens.test.js` fails the build when a control
height, icon size, spacing step, radius or stroke width lands off its scale, and
when this section drifts away from the numbers enforced there. The design system
is a contract, not a page someone reads once.

Radius is checked four ways: the `rounded-*` classes (only `none`, `ui` and
`full` pass), a bare `rounded`, `border-radius` written directly in CSS (only
`var(--radius)` or `0`), and `rounded-full` on anything that is not a circle.
A separate test requires cards, modals and panels to use `rounded-ui`, and
another checks that this document's radius table matches the enforced scale.

### Named rules

**The Variable Rule.** Colors are only ever consumed as `var(--token)`. A hex literal inside a component is a defect, and the same rule is why adding a palette means editing `lib/themes.js` and nothing else.

**The Paper Rule.** Backgrounds are always warm. Pure `#ffffff` and pure `#000000` do not appear as surfaces in any palette. A neutral grey reads as unfinished paper.

**The Note Accent Rule.** A note's color appears as a 13% tint over the card plus an 18% blurred glow, never as a colored border or a colored title. The card stays paper; the note's identity arrives as light on it.

## Typography

**Display / Headline / Title / Body / Label Font:** JetBrains Mono (with `ui-monospace, monospace`), the default and the face every screen is designed and checked in.

**The font library.** Settings → Typography holds twelve families from `lib/fonts.js`: monospace (JetBrains Mono, Fira Code), sans (Inter, Roboto, Fira Sans, IBM Plex Sans, PT Sans, Noto Sans) and serif (Source Serif 4, Georgia, PT Serif, IBM Plex Serif). The choice is the person's, stored in the `fontFamily` store and applied as `--font-family` on the root. `body`, `h1`-`h3`, `.font-serif` and `.font-sans` all read `var(--font-family, 'JetBrains Mono', ui-monospace, monospace)`, so a choice changes every string in the interface at once. `.font-mono` does not follow it: code blocks, inline code and other fixed-width text stay in JetBrains Mono, whatever face the rest of the app uses.

Only JetBrains Mono ships with the app (`public/fonts`, Latin and Cyrillic). The other families are used when the system has them; otherwise each one falls back to its own category's stack (`system-ui, sans-serif`, `ui-serif, Georgia, serif`, `ui-monospace, monospace`). A face that is not installed must never break the layout, only change the letterforms.

**Character (default face):** A card index in a typewriter hand. Even spacing makes columns of metadata align without effort, and the uniform stroke means no element can shout through typeface alone, so hierarchy has to come from size and weight.

### Hierarchy

- **Display** (700, `30px`, 1.25, `-0.025em`): page titles only: Settings, Trash, Templates (`text-3xl`). The single largest type in the app.
- **Headline** (700, `24px`, 1.25, `-0.025em`): modal titles (`text-2xl`) and the editor title at `xl`. The editor title scales with the window (`text-lg` → `lg:text-2xl` → `xl:text-[1.7rem]`) because it is the note's own title and should dominate its surface.
- **Title** (700, `20px`, 1.3, `-0.025em`): `h1` (`text-xl`) and card titles at desktop.
- **Body** (400, `14px`, 1.625): running text, note excerpts, descriptions. Reading measure is governed by `--content-width` (34/46/60/78rem or full), not by the type scale.
- **Label** (400, `10px`, `0.12em`, uppercase): the metadata voice: timestamps, folder paths, tag text.

`h1`/`h2`/`h3` use `tracking-tight`. Everything global carries `transition-colors duration-200`.

### Named rules

**The One Face Rule.** No screen mixes typefaces. Every family name a component could reach for, serif or sans, resolves to the one face the person chose (JetBrains Mono by default), so a stray class can never introduce a second voice. The only fixed exception is `.font-mono` for code.

**The Scale Is Small.** The working range is `11px`-`30px`. `text-xs` and `text-sm` carry the interface; `--text-whisper` (11px) carries metadata and `--text-whisper-lg` (12px) its labels. No arbitrary pixel sizes. `text-3xl` is page titles and `text-2xl` is modal titles; nothing in between them is allowed to grow.

**The Whisper Rule.** Metadata is uppercase, `9-10px`, and tracked `0.1-0.16em`. It is set at or below `--text-secondary` opacity and never competes with the note title directly above it.

## Layout

A three-region app shell (a resizable sidebar, the main surface and an optional inspector) inside a fixed `100vh` flex column with `overflow-hidden`. There is no page scroll; the main region scrolls independently.

**Density:** compact and consistent. The modal rhythm is `gap-2` / `gap-3` / `gap-4`; the dominant padding pair is `px-4 py-2` for controls and `p-4` for panels.

**Grid:** the note board draws 2, 3 or 4 columns (`boardColumns`, default `3`), worked out from the board's own width, not the window's: a card is never narrower than 280px, so the column switcher shows only the counts that fit (with the sidebar open at 1440px: 2 and 3), and none at all when even two do not. The chosen count is kept and comes back when the board widens. A phone shows 2, a tablet 3.

**Edges:** two insets, everywhere. Bars (the app header, the note's top row, the editor toolbar and the note's footer) sit 16px (`px-4`) from the content area's edges, their icon buttons the same 40px, so the back arrow and the sidebar toggle never move between screens. Page content (settings, help, trash, templates, the notes table, the board, the note's title and its text) starts 48px in on a wide window (`lg:px-12`) and 16px on a phone, 32px below the header (`lg:py-8`), inside `max-w-5xl` (the table `max-w-6xl`). A note's title column follows `--content-width`, so the title starts where the text does.

**Responsive:** `1024px` is the structural breakpoint, derived at runtime in `App.svelte` as `isMobile`, not a CSS media query. Below it the sidebar stops being a column and becomes a full-width `fixed inset-y-0` overlay that slides away on navigation. Tooltips are suppressed entirely below `640px`.

**Editor measure:** `--content-width` sets the text column (34-78rem, or full), independent of the window. `--editor-font-size` (13-20px) and `--font-size-base` (14-20px) scale UI and editor separately.

## Elevation & Depth

**Flat at rest, lifted in motion.** Depth is a response to state, never a resting property. At rest every surface is flat: cards carry `shadow-sm shadow-black/[0.03]`, an opacity so low it reads as paper texture rather than as a shadow. Only two things in the system cast real shadows: a hovered card (`shadow-xl shadow-black/10`, lifted `translate-y(-0.5px)`) and a modal (`shadow-2xl`).

Overlays dim with `bg-black/20` plus `backdrop-blur-sm` in light mode, and a `--bg-tertiary` wash in dark mode.

### Shadow vocabulary

- **rest** (`0 1px 2px rgb(0 0 0 / 0.03)`): the resting card. Effectively invisible; it stops the card from dissolving into the page.
- **lift** (`0 20px 25px -5px rgb(0 0 0 / 0.1)`): hover on a note card, paired with a 0.5px upward translate.
- **overlay** (`shadow-2xl`): modals and the command palette, the only shadow that reads as *above* the app.
- **scrollbar** (6px wide, `rounded-full`, `--bg-tertiary`, hover `--text-muted`): the system uses chrome thickness instead of shadow to define scroll affordances.

### Named rules

**The Flat-By-Default Rule.** A surface at rest has no meaningful shadow. If a component is permanent rather than hovered, it earns separation from a border or a tonal step, not from depth.

**The Lift Means Touch.** Elevation appears only when a thing is being approached (hover, focus) or is truly above everything (modal). There is no shadow that means "important."

## Shapes

The form language is one rule applied consistently: **one radius.**

Every rectangle is the same rounded square: a card, a modal, a panel, a field, a
tag and a checkbox share `--radius` (6px), and the density of a card changes its
size and padding, never its shape. A circle is kept only for things that are round
by nature: colour dots, spinners, swatches. A square control drawn as a circle is
a square control drawn wrong, because the eye matches corner curvature before it
reads anything.

Field underlines have zero radius by definition; they are a single border line.

## Components

### Buttons

**Shape:** text is the whole button, so a filled or outlined button contradicts the type. Corners take the one radius, `rounded-ui` (6px).

- **Primary** (`getModalButtonClass('primary')`): `--text-primary`, `font-bold`, `text-sm`, `uppercase`, `tracking-widest`, `flex-1`, `py-2`. Hover is `opacity-70`; disabled is `opacity-30` with `cursor-not-allowed`.
- **Secondary:** identical geometry with `--text-secondary` and `font-normal`; hover shifts the color to `--text-primary`.
- **Minimal** (`.btn-minimal`): inline, `px-4 py-2 text-sm font-medium`, same opacity treatment.
- **Text action** (in page sections such as Settings and Templates): `inline-flex min-h-9 items-center text-xs uppercase tracking-widest font-bold`, hover `opacity-60`, disabled `opacity-30`. No frame and no fill; neighbours sit `gap-x-6` apart so two actions never read as one phrase. A frame is kept only by a toggle among options (`aria-pressed`), where it marks the chosen one.
- **Icon buttons** (`TooltipIconButton`): `rounded-ui` (6px), 36px, 1px `--border-subtle` border, `--text-secondary`; hover darkens border and text. The radius is the same at 28px. Always paired with a tooltip except below `640px`. A tooltip that names a thing ("Trash") is a small capital tag on one line; one that explains (over 32 characters) is ordinary sentence case and wraps inside its box at `max-w-xs`, whatever case the surrounding block uses. A tooltip waits 450 ms under the pointer (keyboard focus shows it at once), and a row that already shows its name has none. **There is one tooltip.** `lib/tooltip.js` gives every `title=` in the app (and `data-tooltip`) the same box, delay and placement, so the system's grey tooltip never appears; a tree row shows its full name beside it (`data-tooltip-position="right"`) only while the name is cut off; a click puts a tooltip away until the pointer leaves. Every clickable thing answers the pointer: a background, border or text change on hover, except the item already chosen.

### Chips

- **Style:** `rounded-ui`, 1px `--border-subtle` border, `--bg-primary` at 45% opacity, `--text-secondary`, `px-2 py-0.5 text-[10px]`.
- **State:** tags are inert labels, not filters. Overflow collapses into a `+N` chip in the same style rather than into an ellipsis. On search highlight, matching text inside a tag is wrapped rather than restyled.

### Cards / Containers

- **Corner Style:** `rounded-ui` (6px) at every density.
- **Background:** `--bg-primary`, with a `--note-tint` overlay (accent at 13%) that rises to full opacity on hover.
- **Glow:** a 128px `--note-glow` blob (accent at 18%, `blur-2xl`) anchored off the top-right corner, clipped by `overflow-hidden`.
- **Shadow Strategy:** see Elevation: rest at `3%`, lift to `10%` with a 0.5px rise.
- **Border:** 1px `--border-subtle`, softening to `--text-secondary` at 40% on hover.
- **Internal Padding:** `px-4 py-4`, stepping to `px-5` at `sm`. Compact cards use `px-3 pb-3.5 pt-3`.
- **Internal rhythm:** title → path (`mt-1`) → excerpt (`mt-2`) → tags and timestamp pinned to the bottom with `mt-auto`. Excerpts clamp to 1 line compact, 2 lines desktop.

### Inputs / Fields

- **Every search looks like the board's.** One `SearchField` (the header uses the same classes): 40px (44px on a phone), `--bg-secondary`, a hairline border that darkens on focus, a 16px magnifier inside on the left, text-sm with a `--text-secondary` placeholder, and × to clear (Esc clears first, a second Esc closes what holds it). The notes table, templates, the template library, tags, the help, the command palette (⌘K, ⌘O) use it; the terminal's find bar (⌘F) is the same box a size down (32px, text-xs, 28px arrows and ×), because it shares a crowded row.

- **Style:** underline only, with a transparent background, 1px `--border-subtle` bottom border, no radius, `h-9 text-sm leading-6`. Shared via `formFieldClass()` so `<input>` and `<select>` sit on the same baseline.
- **Height is declared, never derived:** `h-9`, not `py-* + leading-*`. A derived height silently grew by the 1px border and measured 37px against 36px elsewhere. The base rule in `app.css` sets colour and focus only; it carries no vertical geometry on purpose, and it lives inside `@layer base` so component utilities still apply. Any text field that needs its own height says so with `h-*` or `py-*`.
- **Focus:** the bottom border shifts to `--text-secondary`. No glow, no outline, no ring. Boxed and pill fields may brighten to `--text-primary` on focus, because they are a different object and not a form row.
- **The base rule is a default, not an owner:** `app.css` gives every `input[type="text"]` / `textarea` the underline look, but its selector is wrapped in `:where()` and it carries no vertical geometry. Without `:where()`, `input[type="text"]` scores (0,1,1) against a field's (0,1,0) utility and silently wins, and that cost the pill fields their `--bg-secondary` fill and their own focus colour. Source order cannot repair this; only equal specificity ties break by order.
- **Disabled / Error:** fields keep the underline; errors are communicated through the `--red` token in text, not by changing the field's shape.
- **Search and filter fields** are the exception: they are pills, because a field you type into should read as a distinct object, not as a form row.

### Navigation

The sidebar is the app's left edge: a resizable column (`w-0` when collapsed) holding the file tree, search, and quick-note capture. Selected items are marked by `--text-primary` weight against `--text-secondary` siblings. No pill, no highlight bar. Below `1024px` it becomes a full-width overlay.

### Modals

`rounded-ui` (6px), `--bg-primary`, 1px `--border-subtle`, `p-8`, `shadow-2xl`, default `w-96`. The close control is a 36px `rounded-ui` icon button pinned top-right, the same rounded square as the panel holding it. Footer buttons are the uppercase text-only pair described above, each `flex-1` so they split the row evenly.

**Ask only before what cannot be undone.** A note moved to the trash goes at once, and a notice at the bottom (`role="status"`, the one radius, `shadow-2xl`) says so with an Undo action for 8 seconds; the timer pauses while the pointer or focus is on it. A confirmation dialog is kept for what is lost for good: a folder, several notes at once, emptying the trash, a new access token.

**Phone bottom bar.** Below `sm` each note action is a 44px column, icon over one short word (`editor.footerShort`), so nothing is a bare icon on a device without tooltips. Six fit at 360px; pinning moves into the ⋯ menu there.

### Cards and the note header

- **Card text** is the note's words, not its Markdown (`lib/card-excerpt.js`): no code, table rules, task boxes or callout markers. After a heading the next line follows a colon, after a list item or a table row a comma, so a list reads `milk, bread, coffee`; running sentences join with a space. **No middle dots as separators anywhere in the interface** (a status reads `main` and, beside it, `everything synced`; a count follows its label after a colon): items are set apart by space, a comma or a colon.
- **Card date** is the day, relative: `Today, 07:54`, `Yesterday, 18:10`, `12 Oct`, `3 Mar 2025`. The word for what the date is (modified, opened) and the exact moment live in the tooltip, not on every card.
- **Note header** carries one date, `Modified …`; the creation date is its tooltip. Items are set apart by even space (`gap-x-6`), not by dots, and each says what it counts: `30 words, 1 min read` and `1 of 3 tasks` beside its bar.
- **Toggles keep their name.** Pin stays "Pin" and shows the pinned state by being pressed (filled pin, `--bg-secondary`), never by turning into "Unpin".
- **Destructive icons are quiet at rest.** The trash in the note header is `--text-secondary` and turns `--red` on hover or focus.
- **Locking a note** is an action, so it lives in the note's ⋯ menu ("Password protection…"), not among its properties.
- **A note's colour in the editor** is the header only: the same 13% tint and 18% blurred glow as its card, behind the title. The page the text is written on, the toolbar and the bottom bar stay the theme's own, so the colour never sits under every line. Focus mode drops it.
- **One bar above a note.** The sidebar runs the full height on every page and the app bar belongs to the content column. A note brings its own header instead: back, the sidebar toggle and the trash share a row with the folder path, so the text starts high and the note's colour covers one block. The colour layers are a tint and a radial gradient (not a blurred circle, which a short header cuts into a band).
- **Note header actions** (Outline, History, Print) are sentence case like the bottom bar's; capitals stay with labels and dialog buttons.
- **The new-note card** on the board is an invitation, not a note: a dashed outline with a plus, quiet until hovered, so the first slot does not weigh like a blank card.
- **Theme choices** show themselves: each is a small preview of its light and dark page with text and an accent, six in a row; the chosen one is pressed and framed.
- **Inside a note, menus open at what is being typed.** The `/` commands and the `[[` suggestions start under their trigger and flip above the line at the bottom of the editor; the commands show the Markdown that makes each block. A panel's own list (folders) is part of the panel, never a second popup over the bottom bar. Due dates offer Today, Tomorrow, In a week and the system calendar; tags offer the ones already in use.
- **Block tools join the toolbar row.** With the caret in a table: + Row, + Column, − Row, − Column, Delete table; in a code block: the language and Copy. They sit after the link button in the same row, so the text never jumps when they appear.
- **Web addresses open from the editor.** A plain `https://…` is underlined like a link (a decoration; the file keeps it as typed). It and any Markdown link open in the browser on Ctrl/⌘+click, Ctrl/⌘+Enter, or from the bar under the caret. Only http(s) and mailto open.
- **Pictures keep their names.** A dropped or pasted picture is saved under its own name ("Снимок экрана 2026-10-16.webp") unless it is a generic one (image, blob, clipboard), which gets a dated `image-…`; a dated name shows no caption. The link escapes only spaces and parentheses, so the Markdown stays readable and opens elsewhere.
- **A sync conflict is seen where the notes are and resolved in the note.** The card says "Conflict", the tree shows a red dot, the sidebar carries a conflict link that counts the notes and ends with the word "open". In the note the banner says it changed on two devices. Each version is named by its device and time ("Phone, today 14:35"; this device is marked as such), and the words that differ are highlighted in both columns. One click keeps a whole version for the note (the other stays in its history); for a mix, each part has "Keep Laptop / Keep Phone / both" as pressed toggles, the dropped side dims, and Apply sits under the last part with "Chosen: N of M". On a phone the original comes after the two versions. A resolved conflict is sent right away when sync uploads on its own, and a toast says whether it went out or when it will. Parts are applied from the last one back, "both" keeps the versions as separate paragraphs (one list for list items), and the text around each part keeps its blank lines. A note that still holds markers is never sent by a sync. The outline is hidden while a note is in conflict. Settings words the status without git terms.
- **Every kind of conflict has a screen, and nothing is written over.** A part neither version gets right is written by hand ("Write my own"). A conflict in the properties shows named values ("Tags: дом", "Due: 20 Oct 2026"), and "both" merges tags instead of doubling the key; two different dates offer no "both". A note deleted on one device and changed on the other says so in a sentence naming the device, with "Keep the note / Bring it back" and "Delete the note". While a note is in conflict its title and properties are locked. An open note reads its file again after a sync; a save that started from older text is refused by the server and combined with what arrived (separate edits merge, the same place becomes a conflict). Its sides are named from the history (this device, and the last device that changed the note) on screen and on the marker lines in the file. A file that is not a note (an image) is resolved in Settings, looking at both pictures; the sidebar link scrolls there. Commit titles in a note's history are shown in the interface language.
- **A locked note in conflict is never merged as cipher.** Git's line merge would put markers inside the sealed text and leave a note no passphrase opens. The file stays this device's sealed version, both versions wait in git, and the note opens on its own conflict screen (not the passphrase form, which would show one side and let it be edited): keep one version whole without opening it, or enter the passphrase to compare. The versions are opened in memory, merged like any note (separate edits combine with one button, the same place is chosen part by part; every part must be chosen), and the result is sealed again before it is written. A version sealed with another passphrase is named, and only whole-version keeping is offered.
- **One word, one thing.** "Folder" is where a note's file is: the bottom bar shows it ("Work", "No folder") and moves the note; a new name creates the folder. The due date has its own button and is not counted again under Properties; the notes table calls it "Due" and shows dates as the Modified column does. The sidebar's sync is "Sync now", never "Back up". Settings name what each size changes: "Interface size", "Text size in notes".
- **Callouts read as in Obsidian.** The `[!type]` marker is hidden unless the caret is on its line; the title is bold in the callout's colour on its own line; the body is not italic. The file keeps the text as written.
- **The agent terminal sits under the note.** A bottom dock in the content column (⌘J or Ctrl+`, the terminal button at the foot of the note and in the board header, the note's three-dot menu, or the palette; the sidebar has no Terminal row), in the theme's own colours and JetBrains Mono, opened in the notes folder. Its header keeps in view only the label, the tabs ("Shell 1"…, each its own shell, up to six, + for a new one, × to close), "Agent changes: N" when there are any, "Start <agent>", ⋯ and hide; search (also ⌘F: Enter, Shift+Enter, Esc), restart and the agent's rules sit behind ⋯, with a small dot on ⋯ while the rules are missing. Hiding keeps the shells running. A note path in the output is underlined and opens the note. It opens at 45% of the window (never under 320px) until its top edge is dragged (double-click resets). It exists only in the desktop app: a browser or a phone shows no trace of it. Files the agent writes appear on the board, in the tree and in the open note as it writes them.
- **The agent is one button away, never a chat to learn.** The terminal's header starts the agent chosen in Settings ("Start Claude Code"); the note's ⋯ menu asks it about this note (not offered for a locked note), typing the question with the cursor left where the person writes. Until the notes folder has rules for the agent, the header carries a quiet underlined link reading "Add rules for the agent".
- **The agent's edits wait for the person.** Notes the agent changed carry a blue "Agent" label on the board and a blue dot in the tree; the terminal's header shows "Agent changes: N". The review window lists them (New, Changed, Deleted) beside the difference against how they were when the agent started, with Keep and Revert for one file or all. Kept edits go to the other devices as "Agent edits"; until then nothing the agent did leaves this computer.
- **A paused sync says why.** When an agent's edit waiting for review was also changed on another device, the sync stops before git would fail and says so in words, naming the notes; the sidebar keeps a blue "Sync waits for agent changes" link to the review until they are kept or reverted.
- **The sidebar footer stays short.** On a wide window it shows Trash, Help and Settings (and Sync, and a conflict when there is one); the places opened now and then (the notes table, tags, saved searches and templates) share one "More" row whose menu opens above it. All of them are in the command palette too. The phone's drawer, with room to spare, lists them all.
- **The Help is a reading page, not a modal.** Help (lifebuoy, bottom left, and the palette) opens `/help`: one long page in the interface language, sections listed on the left and marked as they scroll by, topics in serif headings with Markdown bodies, the FAQ last. The search above finds a topic by all of its words (ё as е), lists the matches with their section and a highlighted excerpt, and a click jumps to the topic and flashes it. On a phone the section list hides and the search does the finding. Labels in the text match the interface word for word.
- **Focus is quiet and only from the keyboard.** The focus ring is a thin line in the theme's ink, never the system accent, and a mouse click never draws it. A menu opened with the mouse takes the focus itself; opened from the keyboard, its first item does, and a focused item is a highlighted row like a hovered one.
- **Destructive actions are words.** The trash card says "Restore" and "Delete forever" instead of two bare icons, and names the folder the note was in rather than repeating its file name.
- **The board answers "what is here and in what order".** Above it a strip of the busiest tags, one row that never wraps (up to four chips, as many as the width holds, measured; the rest wait behind "All tags") (one tap narrows the board at once, a second tap lifts it; the tag is not remembered) and "N more", a dashed chip that opens a list of every tag with its count and a search box (a chosen tag always shows as a chip, whichever way it was chosen) and, beside the column switcher, the order (recently changed, recently opened, by title; remembered) and "By color", named in words, not only by its icon. Once something is pinned the board gets two headings, "Pinned" and "Recent" ("All notes" when ordered by title); without pins it has none, and the new-note card sits first among the unpinned. Chips, "All tags" and the box beside them are all 38px tall; the column switcher is named in words ("Columns"), not by an icon. The last line reads "Showing N of M". On a phone there are no chips: one "Tags" button (it shows the chosen tag's name while one is chosen) opens the same list, in the one row with the order and the colors button, which is icon-only there.
- **A note leaves the phone's screen to its text.** Under the title one line holds the date and "Structure" and "History" (Print is for a computer); the first block of the text has no top margin of its own, so the text starts about 70px higher than before.
- **Overlays can be used without a mouse.** Every dialog has a name (its title) and holds Tab inside itself: from the last control it goes to the first; Esc closes the top dialog only, and focus returns to what opened it. The command palette is one combobox: the highlighted row is named in `aria-activedescendant`, rows are not Tab stops, Esc works from any row. The focus ring is 2px of the theme's ink at 85%, which keeps 3:1 against both page backgrounds in all twelve palette and mode pairs (a unit test counts it). `--text-muted` is never a text colour; readable small text is `--text-tertiary`. The page has one h1 (the note's title; "Home" on the board), a labelled navigation for the sidebar and a "Skip to content" link as the first Tab stop.
- **Note history is a timeline.** Versions hang on one rail, newest on top ('Newer' above, 'Older' below), cut into days (Today, Yesterday, then the date); each dot is a version with its time, and the newest is marked. The chosen version fills its dot.
- **Attachments have their own page** in the sidebar's Tools menu (and the phone's list): every picture and PDF as a card with its size and date and the notes that use it; a click on a note opens it. "Unused" narrows the grid to files nothing points at (with their count and size above the grid), and while a locked note is closed nothing is called unused. The page is meant for a large vault: sorted (newest, biggest, by name, most used), narrowed by type and folder, drawn 60 at a time, and it keeps its search and place when a note is opened and closed again. A click on a picture shows it large with every note that uses it, and gives open, copy for a note, and move to trash. Cards show a small copy (`/api/attachments/thumb`, made by the app's image library, the first page for a PDF where the system can preview one, kept in `.monos/thumbs` and keyed by size and time), never the original; the list of the whole vault re-reads only the notes that changed since the last one. A note that only writes a file's name is marked "by name" (a weaker kind of use than a link). The folder is chosen from a searchable list, and on a phone the filters wait behind one button. Look-alike files are told apart by the end of their folder path and a "Same name" filter; the search ignores `_`, `-` and `.`; the large view has previous/next (arrows) and a click to the real size. "Select" follows the filters (a file a filter hides leaves the selection) and picks unused files for the local trash (`.monos/attachments-trash`, kept 30 days; a file a note uses is refused by the server) and every removal has an Undo in a notice fixed to the window; "Recently removed" lists the trash and restores one file or a batch (a name taken again is never overwritten). A batch the server only partly moved is reported as such and the list is read again. A file used by several notes lists them all (two shown, the rest one click away). Settings holds no list of files: only a link to this page.
- **The font can be the system's own** ("System font" in Settings, first in the list): San Francisco on a Mac, Segoe UI on Windows. Nothing is loaded for it.
- **The Notes table is a secondary view and behaves like one.** It appears in Tools only once a note has a property of its own. It opens with the familiar fields (status, priority, due, project…) as columns, not with whatever a plugin wrote most often; the columns offered are the eight most used plus the chosen ones, with the rest behind "N more" and a search; the sort and the columns are remembered between runs and the filter while the app is open; a table cut at its row limit says how many of how many it shows. On a phone the filter syntax waits behind a line. A click on a cell changes the property of that note in place (Enter saves, Esc cancels, a flag toggles at once, an emptied cell removes the property, a failed write stays open and says so) and the row stays where it is; the header and the Note column stay in view while the table scrolls; the filter suggests the fields and then the values the notes carry.
- **The Sync button is steady.** It is shown when a repository with a remote is connected and not otherwise (a repository kept only for history has nothing to send). The last known answer is kept between runs, so the button is there from the first frame, and a failed or busy status check (an error answer, being offline) leaves it as it was; only a real answer changes it.
- **A note says where it stands with sync, from git itself.** When a repository with a remote is connected, the line under the title shows, beside the modified date, "Synced <time of this device's last sync>" or "Not synced"; the tooltip of the second says on which side the versions differ (changed here and not sent; changed on the remote since the two met, as of the last fetch; or both). The state is git's, not a comparison of times: the server lists the paths that wait to be sent (uncommitted, new, or committed on no remote) and those that wait to be received, in the status; a save marks the note not synced at once and the status is read again a moment later (and on every change in the folder). Without a remote the line is not drawn; on a phone it is hidden.
- **Help can be walked.** A wide window lists the topics of the open section under it (the one in view is marked); a phone gets the sections as chips in a strip that stays at the top while the header scrolls away with the page. A topic has an address (`/help?topic=section/topic`) that survives a reload; `/` focuses the search and Esc clears it; every section ends with "To the top". Everything new is covered in both languages.
- **The Settings list follows the page.** The part in view is marked, a part chosen from the list stays marked while the page scrolls to it, the last part is marked at the very end, and on a narrow window the strip keeps the marked part in sight.
- **The phone's menu keeps its tools in two columns**, so the notes keep room above them.
- **Pinned and favorites are two things.** Pinned notes lead the board and sit at the top of the sidebar; the section folds to one row (remembered), shows a third of the panel at most and scrolls inside, and a right click on a pinned note gives "Unpin". The board follows the sidebar's list at once. Favorites are a separate list under Tools: the note's ··· menu adds or removes the mark (a `favorite` property in the note), the page lists them with a star to take one off.
- **An imported archive keeps its pictures.** After unpacking, every picture and PDF link is found again (by path, by Joplin's `:/id`, by file name; Obsidian `![[…]]`, percent-encoded Notion paths, HTML `<img>`), the file is put in the note's own `_attachments/` and the link rewritten to it; emptied old folders go. The result line says how many links were repaired and how many pictures the archive lacked.
- **A pin has one mechanism.** The note's own `pinned` flag is the truth. Every change, from the sidebar, the board or the open note, goes through one place: the lists update at once, the open note's pin button follows, a failed write puts the pin back everywhere, and a tree that was requested before a change never undoes it.
- **Tabs can be saved as spaces** (Settings, and the editor's More menu: keep, 2 or 4 spaces). Each tab goes to the next tab stop; fenced code keeps its tabs.
- **The editor's More tools menu is not an overflow marker.** The rarer tools (strike, inline code, H4, code block, rule, table) join the toolbar while it has room and move into the menu as it narrows; each setting row there is clickable along its whole line.
- **Exports leave clean.** The YAML header never reaches HTML or PDF. Markdown and text exports of a note with pictures or PDFs come as one zip that unpacks into a folder (the file beside `_attachments/`); HTML keeps its pictures inline. An empty note or an empty list item is not written as `&nbsp;`.
- **Content width changes the text only.** The title, the line under it and the formatting bar sit in a column of fixed width and keep their place whatever the setting; the text stays centred and the setting moves both margins together, like the margins of a typewriter page (Narrow to Very wide; Medium, about 100 characters a line, is the default). Focus mode uses the same fixed column for the title and the text.
- **The Structure column is drawn like the sidebar and the terminal.** Its left edge is the handle: drag to widen or narrow (192-480px), double click for the default 224px, arrows nudge by 16px; the width is remembered. The × in its header folds the column away on a wide window (the note's Structure link brings it back) and closes the overlay on a phone. Headings show as the reader sees them, without `**`, `_` or link markup, and a `---` rule in the text never cuts the list short.
- **Controls are sized for a finger and for a pointer.** Everything pressable is at least 24px tall (WCAG 2.5.8): checkbox rows, text buttons and summaries in Settings, outline rows, the note's Structure and History links; on a phone the rows are 44px. The phone's formatting toolbar is a scrolling strip of 40px buttons (seven in view; 44 would show six). Under "reduce motion" jumps scroll without animation and a board card does not lift on hover. The browser's `theme-color` is the palette's page colour, and native `<select>` lists take the app's mode through `color-scheme` on the selects alone (on the whole page it halved rendering speed in Chromium and made the editor's caret unreliable).
- **Everyday words, not the tools' words.** In Russian the fields at the top of a note are "Поля" (not "Свойства"), the table of notes is "Заметки таблицей", the sidebar's overflow is "Инструменты" (so "Ещё" means only one thing: more of the same). A wiki link reads as its name: the `[[ ]]` hide while the caret is elsewhere and come back when it touches the link (the file is not changed); with an alias only the alias shows. Git's own words, the branch and the change note ("commit message"), sit behind one-click disclosures in Settings and are explained in a line; the GitHub token steps are written in Russian with GitHub's English button names in quotes. A disclosure keeps the browser's marker: a line that is not marked reads as plain text.
- **First launch has one thing to do.** "New note" is the only filled button on the empty screen; choosing a folder and connecting GitHub are quiet text buttons.
- **Settings order follows need**: Appearance, Data, Sync, Devices, Agent, More. The risk of opening notes to the Wi-Fi is a bordered note beside the switch, at reading size.
- **The terminal loads when asked.** Its module (xterm, about 100 KB gzipped) is fetched the first time the terminal is opened or the agent is launched; once open it stays mounted, so hiding it keeps the shells running. The note page is bundled with the app on purpose: measured in Electron, loading it lazily saved about 50 ms of first paint and nothing else, and cost a second code path (and the first note opened a moment late in the first seconds).
- **The Help's key table is true and kept true.** "Keyboard shortcuts" lists every key the app answers, in five groups (everywhere, on the board, in a note, in the tree, in the terminal), each key drawn as a key cap. The text is written with the Mac's symbols and shown as Ctrl and Shift on Windows and Linux (`platformKeys`). `e2e/45-hotkeys.spec.js` presses each one; a unit test keeps the Russian and English rows the same. A key added to the app goes into the table, and into that spec. In a window narrower than 640px the note's footer has no terminal button (no room), so "Terminal" is the second item of its "…" menu, above "Ask the agent". Inside the terminal Ctrl+J is the shell's newline, so Ctrl and the key above Tab is the way to hide it there.
- **Saving never rewrites what the editor cannot keep.** Opening a note does not touch its file. The rich editor writes Markdown from its own model, so at the first edit it tidies the markup (headings with `#`, `-` and `1.` lists, `**` and `*`, `---`); it cannot hold raw HTML, which it would save as `&lt;div&gt;`, so a note with HTML tags or comments opens as source text, with a one-line notice, and the source mode keeps every byte. There is no "auto-format on save" setting: the old checkbox read nothing, and was removed with the unused vault-wide format route. `e2e/46-save-format.spec.js` pins all four behaviours.
- **The map and a note's relations, without a new button on every screen.** The map is one item, "Map", in the sidebar's Tools (and in the palette, ⌘K): a page of its own, a canvas of dots (a note) and lines (a link), drawn with the theme's ink and the notes' own colours. Notes that link to each other sit close; a note's name appears for hubs first and as the view closes in, and labels that would overlap are dropped, the best connected kept. Click a dot to open; the search names a note and dims the rest; "Notes without links" (hidden by default, with their count) brings the rest in; with more linked notes than a canvas can read (2500) the best connected are shown and the line at the foot says so. A note's Related panel lists every note it is linked with and which way the link goes ("links from here", "links to here", "both ways", two-way first), names the links that lead to no note, and has the little graph (a dot opens its note; past a dozen dots the names are left to the hover tip) and "Show on the map", which opens the map around that note with its neighbours clear and the far ones faint ("Around X" with "Show all" to leave). The canvas is a picture: the search and its result list are the way to a note without a pointer, and +, - and 0 and the arrows move the view from the keyboard.
- **Assistants get a guide to the notes folder by default.** `.claude/skills/monos-notes/SKILL.md` is written when the server starts, in every notes folder, and never overwritten (a person's edits stay); it is hidden from the board, tree and search, and kept out of the synced repository (a line in `.git/info/exclude`, written when sync is connected): every device makes its own, so a second device never meets a copy of its own file, and two versions never conflict. It says how Monos notes are laid out (names, front matter, links and how they resolve, tags and properties, attachments), how to write the form the editor writes, how to rename on disk (the links must follow), and what not to touch. The rule files point to it.
- **Pinning shows where it acts.** A pinned note leads the board in either order, with a small filled pin before its title, and joins the sidebar's "Pinned" list at once; pressing Pin says so in a toast ("first on the board and in the sidebar"), since nothing changes on the note's own page but the pressed state.
- **Settings is a short page with a way round it.** One "Appearance" part holds language, theme, fonts and the editor text size (their own field labels, not four headings); then the agent, the data (notes folder, backup), sync (GitHub connection, its settings, status, conflicts), other devices, and the collapsed "Advanced". A navigation of those parts sits beside the page on a wide window and in a strip above it on a narrow one (it scrolls by itself, the page never scrolls sideways), stays in sight while the page scrolls, marks the part in view, and opens "Advanced" when it is chosen. The guide is not repeated here: one line points to the Help. The token's "How do I get one?" opens only until a token is entered. Measured: 4.5 screens became 3.4 on a computer (6.7 became 4.9 on a phone) with no token set; with one it is shorter still.
- **A token that cannot write is caught before it fails.** A fine-grained token left at Contents "Read-only" connects and then dies at the first push with a bare 403. When a repository is chosen, a red box says the token can only read and how to fix it (Permissions → Repository permissions → Contents → Read and write); if GitHub refuses anyway, the connection line names the cause in the interface language (read-only token, token not accepted, repository not visible) instead of git's own words.
- **The GitHub connection says where it stands, beside its button.** Pressing Connect repository shows, left of the button, what is happening ("Connecting to owner/repo…" with a pulsing dot, the seconds spent and one line on what takes the time), then the result: green "Connected to owner/repo, branch master", red dot when the notes here and on GitHub disagree, or the reason it failed in red. Never only the box above the form, out of sight, and never a button that flips back and says nothing. At rest, a connected folder shows what it is connected to.
- **First launch is a page, not a dialog.** Until there are notes, the board shows "Where to start": three bordered panels side by side: Start writing (New note), I already have notes (Choose a folder, then Settings at Notes folder; Import ZIP) and Sync devices (Connect GitHub, then Settings at GitHub Connection). Each one has an icon, a title, one sentence and its actions, then one line of keys to try (⌘K, `[[`, `/`, ⌘J) and Help. A phone opening this computer's notes gets only Start writing. Settings opened from here scrolls to that section and tints it for a moment. Nothing is asked before the person has done anything: the device name, which only matters once sync is on, waits filled in with the computer's own name beside the GitHub connection.
- **Focus mode leaves only the text**: the sidebar closes and comes back as it was, the bottom bar and stats go, the header folds to the title row with "Leave focus mode" and the Esc hint.
- **A long note folds its header** while reading down: the title moves into the top row beside back and the trash, the stats fold away, the toolbar stays. It unfolds near the top (with hysteresis, so it never flickers at the threshold).
- **Outline** has one control, "Outline" in the note header, on every screen: on a wide window it shows or hides the column (hiding is remembered), on a narrow one it opens the panel over the note. The column comes up by itself only from three headings on; a shorter note shows its headings in the text already.

### Note content

The editor renders Markdown constructs that a CommonMark parser does not know, and it writes them back unchanged:

- **Task lists.** A list where every item carries `- [ ]` / `- [x]` becomes a `taskList`. A **mixed** list is split into consecutive runs so plain bullets keep their bullets and tasks keep their checkboxes; the order is preserved and the Markdown round-trips byte-for-byte.
- **Formulas.** `$…$` inline and `$$…$$` as a block, rendered by KaTeX. `$5 and $10` stays text, because the marker is only read when a non-space follows the opening `$`.
- **Diagrams.** A ```mermaid fence becomes a rendered diagram, coloured from the live CSS variables so it follows the active theme. A diagram that fails to parse shows its source in `--red` rather than disappearing.
- **Wiki links.** `[[Note]]` stays text in the file and is drawn as a link: underlined at 40% of `--text-primary`, dashed and `--text-secondary` when no note answers. With the caret in a link, a small bar under it (the one radius, `shadow-xl`) opens the note, creates a missing one, or lists the notes that share the name. Clicking only places the caret, so the link text stays editable; Ctrl/⌘+click and Ctrl/⌘+Enter open it at once.
- **The raw mode** is the same note as plain Markdown, toggled from the editor toolbar, for when the rich editor rebuilds something differently than intended. Because a note is a file in git, seeing the exact bytes matters.

## Do's and Don'ts

### Do:

- **Do** read every color through `var(--token)` and every family through `var(--font-family)`; use `.font-mono` only for code.
- **Do** check a new screen in JetBrains Mono and in one sans and one serif from the library: hierarchy must hold in all three, through size and weight alone.
- **Do** keep surfaces flat at rest and let hover supply the lift. A 0.5px rise with `shadow-xl` is the system's only standard "this is alive" signal.
- **Do** set metadata uppercase at `9-10px` with `0.1-0.16em` tracking, at or below `--text-secondary` opacity.
- **Do** express a note's color as a 13% tint plus an 18% blurred glow.
- **Do** use the one radius, `rounded-ui` (6px), for every rectangle. To change the corners, change `--radius` in `app.css`.
- **Do** extend the system by adding a token to `lib/themes.js` and confirming it across all six palettes.

### Don't:

- **Don't** hard-code a font family in a component. A literal family bypasses the person's choice and puts a second face on screen; add a family to `lib/fonts.js` instead, with a fallback stack of its own category.
- **Don't** introduce filled, bordered, or pill-shaped buttons. Text-only uppercase is the button, and a filled CTA would be the single most "designer-made" thing this app could do.
- **Don't** draw a square control as a circle. A round close button on a rounded card reads as two design systems at once, because the eye compares corner curvature before it reads anything.
- **Don't** let one surface change its radius per breakpoint. Density changes size and padding; the shape stays.
- **Don't** use pure white or pure black as surfaces, and don't reach for neutral greys, because the palette is warm paper by construction.
- **Don't** give a permanent surface a resting shadow. Depth is a state response.
- **Don't** use a functional accent color for decoration. Clay Red, Ember Orange, and Ochre Yellow mean error, warning, and pending; spending them on style spends their meaning.
- **Don't** add animation that isn't a state change. The system moves at `duration-200` on `transition-colors` and goes no further.
