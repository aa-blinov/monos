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

# Design System: Monos

## Overview

**Creative North Star: "Стол с разложенными карточками"** (A desk with cards laid out)

Monos looks like a desk under warm light. Notes are cards laid out on it — each one with its own tint, its own label, its own place in the stack. Nothing is "UI" pretending to be paper; the paper is warm because the palette is warm, and the layout is orderly because a desk is orderly. The system borrows the calm of a printed page rather than the energy of a tool.

The reading is quiet and typographic. Every note title, tag, date, and control is set in one face at a time — JetBrains Mono unless the person picks another from the font library — because a card index is sorted by legibility, not by personality. The default monospace is the single most characteristic decision here: it says *this is where text lives*, and it makes every string on screen look like it was placed by a person rather than by a component library. The font library lets a person trade that voice for their own reading comfort; the discipline that survives the trade is one face per screen.

Density is moderate and deliberate. Metadata shrinks to `11px` with wide tracking so it whispers; titles sit at `18–24px` and carry the weight. The result is a screen with a clear loud part and a clear quiet part.

Anti-reference, confirmed: **never "designer-made."** The system must not look styled, curated, or showcased. Nothing glows for effect, nothing has a gradient nobody asked for, no surface announces itself as important. The anti-reference is craft without ornament — and where restraint could turn into neglect, the standard is a well-set book, not a barebones tool.

**Key Characteristics:**

- Warm paper and ink, never pure white and never pure black
- One face at a time: JetBrains Mono by default, or the one the person chose from the font library; code always stays in JetBrains Mono
- Metadata whispers at 11px with wide uppercase tracking; its labels step up to 12px
- Flat at rest, lifted only in motion
- Note color arrives as a tint and a soft glow, never as a border
- Square modals, round cards — tension held deliberately

## Colors

The palette is warm, low-chroma, and paper-based: backgrounds are tinted creams and warm greys, never neutral greys, and accents are earthy rather than saturated.

Six palettes ship (Gruvbox, GitHub, Dracula, Nord, Solarized, Catppuccin); **Gruvbox is the default** and defines the reference character. Every color below is a Gruvbox token. All other palettes expose the identical variable contract.

Tokens live as CSS custom properties in `lib/themes.js` — the single source of truth. Components read them (`bg-[var(--bg-primary)]`); components never hardcode a color.

**Code colours are derived, not chosen.** The accent tokens carry tags, borders and icons — never body text — and measured against `--bg-secondary` they fail AA 4.5:1 in most theme/mode pairs (`--yellow` is 1.28:1 on nord light). Using them raw for syntax would have made highlighted code *less* readable than the plain text it replaced. So eight `--code-*` roles (comment, keyword, string, number, function, type, tag, punctuation) take their hue from the matching accent and are walked toward black in light mode, white in dark, until they clear the threshold. Nothing is hand-tuned per theme; the derivation runs over the palettes at load and a test asserts AA across all twelve pairs.

### Primary

- **Warm Paper** (`#fbf1c7`, light) / **Night Warm** (`#282828`, dark) — the desk surface itself. Every screen, panel, and card sits on this. It is the app's background and the default card fill; the dark value is the desktop default because `gruvbox` ships in dark mode first.
- **Paper Shade** (`#ebdbb2` / `#3c3836`) — the second surface layer: hovered rows, inline code, preformatted blocks, nested panels.
- **Paper Deep** (`#d5c4a1` / `#504945`) — the third layer: scrollbar thumbs, blockquote-adjacent fills, anything that needs to sit *above* shade but below ink.

### Secondary

- **Ink** (`#3c3836` / `#ebdbb2`): every readable sentence. The highest-contrast token in the system and the only one allowed at full strength for body copy.
- **Ink Soft** (`#7c6f64` / `#a89984`): supporting text — excerpts, subtitles, secondary labels. Reads as a quieter sentence, never as disabled text.
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

- **Rule** (`#d5c4a1` / `#504945`) — the single border token, shared by `--border-subtle` and the third background layer. Every divider, field underline, card edge, and chip outline uses it.

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
a card is a `base`) — not the number.

Numbers like 28px, 36px and 40px are not part of this system. They appeared by
accumulation rather than by decision and have been folded back into the grid;
`space-y-7`→24, `space-y-10`→32, `gap-9`→16.

### Control Sizes

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

### Icon Sizes

Four optical sizes, one stroke weight:

| Token | px | Role |
|---|---|---|
| `xs` | 12px | inside text, chips, counters |
| `sm` | 14px | tree rows, inline actions, secondary labels |
| `md` | 16px | default: toolbar, icon buttons, navigation |
| `lg` | 20px | page-level actions |
| `xl` | 24px | rare, large affordances |

`strokeWidth="1.7"` everywhere — a thinner set reads as text, a heavier one as
decoration. Icons may be sized with `size="16"` or with `w-4 h-4`; both are
unambiguous. What matters is that the number is on this list.

### Corner Radius

| Token | px | Role |
|---|---|---|
| `none` | 0px | cancelling an inherited radius — e.g. `code` inside `pre` — and field underlines, which are a single border line |
| `ui` | 6px | **the one radius**: every rectangle — cards, modals, panels, menus, tooltips, fields, buttons, tags, chips, checkboxes, inline code |
| `full` | circle | only shapes that are round by nature: colour dots, spinners, theme swatches, the note glow |

**One radius.** Every rectangle in Monos has the same corner, 6px, set once as `--radius` in `app.css` and exposed to Tailwind as `rounded-ui`. A card, a modal, a tag and a checkbox are drawn by the same hand, so a modal over the board, a menu over a card or a chip inside a card never look pasted in from another app. 6px is small on purpose: it reads as a soft corner on a 400px card and still as a square on a 16px checkbox, so one value works at every size.

Changing the corner means changing `--radius`, nothing else.

`rounded-full` is not a corner. It is kept for things that are circles — equal width and height — and for decoration such as the note glow. A tag, a search field or a segmented control is a rectangle and takes `rounded-ui` like everything else.

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

### Named Rules

**The Variable Rule.** Colors are only ever consumed as `var(--token)`. A hex literal inside a component is a defect, and the same rule is why adding a palette means editing `lib/themes.js` and nothing else.

**The Paper Rule.** Backgrounds are always warm. Pure `#ffffff` and pure `#000000` do not appear as surfaces in any palette — a neutral grey reads as unfinished paper.

**The Note Accent Rule.** A note's color appears as a 13% tint over the card plus an 18% blurred glow, never as a colored border or a colored title. The card stays paper; the note's identity arrives as light on it.

## Typography

**Display / Headline / Title / Body / Label Font:** JetBrains Mono (with `ui-monospace, monospace`) — the default, and the face every screen is designed and checked in.

**The font library.** Settings → Typography offers twelve families from `lib/fonts.js`: monospace (JetBrains Mono, Fira Code), sans (Inter, Roboto, Fira Sans, IBM Plex Sans, PT Sans, Noto Sans) and serif (Source Serif 4, Georgia, PT Serif, IBM Plex Serif). The choice is the person's, stored in the `fontFamily` store and applied as `--font-family` on the root. `body`, `h1`–`h3`, `.font-serif` and `.font-sans` all read `var(--font-family, 'JetBrains Mono', ui-monospace, monospace)`, so a choice changes every string in the interface at once. `.font-mono` does not follow it: code blocks, inline code and other fixed-width text stay in JetBrains Mono, whatever face the rest of the app uses.

Only JetBrains Mono ships with the app (`public/fonts`, Latin and Cyrillic). The other families are used when the system has them; otherwise each one falls back to its own category's stack (`system-ui, sans-serif`, `ui-serif, Georgia, serif`, `ui-monospace, monospace`). A face that is not installed must never break the layout, only change the letterforms.

**Character (default face):** A card index in a typewriter hand. Even spacing makes columns of metadata align without effort, and the uniform stroke means no element can shout through typeface alone — hierarchy has to come from size and weight.

### Hierarchy

- **Display** (700, `30px`, 1.25, `-0.025em`): page titles only — Settings, Trash, Templates (`text-3xl`). The single largest type in the app.
- **Headline** (700, `24px`, 1.25, `-0.025em`): modal titles (`text-2xl`) and the editor title at `xl`. The editor title scales with the window (`text-lg` → `lg:text-2xl` → `xl:text-[1.7rem]`) because it is the note's own title and should dominate its surface.
- **Title** (700, `20px`, 1.3, `-0.025em`): `h1` (`text-xl`) and card titles at desktop.
- **Body** (400, `14px`, 1.625): running text, note excerpts, descriptions. Reading measure is governed by `--content-width` (38/48/58/68rem or full), not by the type scale.
- **Label** (400, `10px`, `0.12em`, uppercase): the metadata voice — timestamps, folder paths, tag text.

`h1`/`h2`/`h3` use `tracking-tight`. Everything global carries `transition-colors duration-200`.

### Named Rules

**The One Face Rule.** No screen mixes typefaces. Every family name a component could reach for — serif, sans — resolves to the one face the person chose (JetBrains Mono by default), so a stray class can never introduce a second voice. The only fixed exception is `.font-mono` for code.

**The Scale Is Small.** The working range is `11px`–`30px`. `text-xs` and `text-sm` carry the interface; `--text-whisper` (11px) carries metadata and `--text-whisper-lg` (12px) its labels. No arbitrary pixel sizes. `text-3xl` is page titles and `text-2xl` is modal titles; nothing in between them is allowed to grow.

**The Whisper Rule.** Metadata is uppercase, `9–10px`, and tracked `0.1–0.16em`. It is set at or below `--text-secondary` opacity and never competes with the note title directly above it.

## Layout

A three-region app shell — resizable sidebar, main surface, optional inspector — inside a fixed `100vh` flex column with `overflow-hidden`. There is no page scroll; the main region scrolls independently.

**Density:** compact and consistent. The modal rhythm is `gap-2` / `gap-3` / `gap-4`; the dominant padding pair is `px-4 py-2` for controls and `p-4` for panels.

**Grid:** the note board is a responsive grid — 1 column on narrow, 2 at `sm`, 3 at `lg` (default), 4 at `xl`. Column count is user-configurable (`boardColumns`, default `3`). Grouped views collapse to 2 columns at `lg`.

**Responsive:** `1024px` is the structural breakpoint, derived at runtime in `App.svelte` as `isMobile`, not a CSS media query. Below it the sidebar stops being a column and becomes a full-width `fixed inset-y-0` overlay that slides away on navigation. Tooltips are suppressed entirely below `640px`.

**Editor measure:** `--content-width` sets the text column (38–68rem, or full), independent of the window. `--editor-font-size` (13–20px) and `--font-size-base` (14–20px) scale UI and editor separately.

## Elevation & Depth

**Flat at rest, lifted in motion.** Depth is a response to state, never a resting property. At rest every surface is flat: cards carry `shadow-sm shadow-black/[0.03]`, an opacity so low it reads as paper texture rather than as a shadow. Only two things in the system cast real shadows — a hovered card (`shadow-xl shadow-black/10`, lifted `translate-y(-0.5px)`) and a modal (`shadow-2xl`).

Overlays dim with `bg-black/20` plus `backdrop-blur-sm` in light mode, and a `--bg-tertiary` wash in dark mode.

### Shadow Vocabulary

- **rest** (`0 1px 2px rgb(0 0 0 / 0.03)`): the resting card. Effectively invisible; it stops the card from dissolving into the page.
- **lift** (`0 20px 25px -5px rgb(0 0 0 / 0.1)`): hover on a note card, paired with a 0.5px upward translate.
- **overlay** (`shadow-2xl`): modals and the command palette — the only shadow that reads as *above* the app.
- **scrollbar** (6px wide, `rounded-full`, `--bg-tertiary`, hover `--text-muted`): the system uses chrome thickness instead of shadow to define scroll affordances.

### Named Rules

**The Flat-By-Default Rule.** A surface at rest has no meaningful shadow. If a component is permanent rather than hovered, it earns separation from a border or a tonal step — not from depth.

**The Lift Means Touch.** Elevation appears only when a thing is being approached (hover, focus) or is truly above everything (modal). There is no shadow that means "important."

## Shapes

The form language is one rule applied consistently: **one radius.**

Every rectangle is the same rounded square: a card, a modal, a panel, a field, a
tag and a checkbox share `--radius` (6px), and the density of a card changes its
size and padding, never its shape. A circle is kept only for things that are round
by nature — colour dots, spinners, swatches. A square control drawn as a circle is
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
- **Icon buttons** (`TooltipIconButton`): `rounded-ui` (6px), 36px, 1px `--border-subtle` border, `--text-secondary`; hover darkens border and text. The radius is the same at 28px. Always paired with a tooltip except below `640px`.

### Chips

- **Style:** `rounded-ui`, 1px `--border-subtle` border, `--bg-primary` at 45% opacity, `--text-secondary`, `px-2 py-0.5 text-[10px]`.
- **State:** tags are inert labels, not filters. Overflow collapses into a `+N` chip in the same style rather than into an ellipsis. On search highlight, matching text inside a tag is wrapped rather than restyled.

### Cards / Containers

- **Corner Style:** `rounded-ui` (6px) at every density.
- **Background:** `--bg-primary`, with a `--note-tint` overlay (accent at 13%) that rises to full opacity on hover.
- **Glow:** a 128px `--note-glow` blob (accent at 18%, `blur-2xl`) anchored off the top-right corner, clipped by `overflow-hidden`.
- **Shadow Strategy:** see Elevation — rest at `3%`, lift to `10%` with a 0.5px rise.
- **Border:** 1px `--border-subtle`, softening to `--text-secondary` at 40% on hover.
- **Internal Padding:** `px-4 py-4`, stepping to `px-5` at `sm`. Compact cards use `px-3 pb-3.5 pt-3`.
- **Internal rhythm:** title → path (`mt-1`) → excerpt (`mt-2`) → tags and timestamp pinned to the bottom with `mt-auto`. Excerpts clamp to 1 line compact, 2 lines desktop.

### Inputs / Fields

- **Style:** underline only — transparent background, 1px `--border-subtle` bottom border, no radius, `h-9 text-sm leading-6`. Shared via `formFieldClass()` so `<input>` and `<select>` sit on the same baseline.
- **Height is declared, never derived:** `h-9`, not `py-* + leading-*`. A derived height silently grew by the 1px border and measured 37px against 36px elsewhere. The base rule in `app.css` sets colour and focus only; it carries no vertical geometry on purpose, and it lives inside `@layer base` so component utilities still apply. Any text field that needs its own height says so with `h-*` or `py-*`.
- **Focus:** the bottom border shifts to `--text-secondary`. No glow, no outline, no ring. Boxed and pill fields may brighten to `--text-primary` on focus — they are a different object, not a form row.
- **The base rule is a default, not an owner:** `app.css` gives every `input[type="text"]` / `textarea` the underline look, but its selector is wrapped in `:where()` and it carries no vertical geometry. Without `:where()`, `input[type="text"]` scores (0,1,1) against a field's (0,1,0) utility and silently wins — that cost the pill fields their `--bg-secondary` fill and their own focus colour. Source order cannot repair this; only equal specificity ties break by order.
- **Disabled / Error:** fields keep the underline; errors are communicated through the `--red` token in text, not by changing the field's shape.
- **Search and filter fields** are the exception: they are pills, because a field you type into should read as a distinct object, not as a form row.

### Navigation

The sidebar is the app's left edge: a resizable column (`w-0` when collapsed) holding the file tree, search, and quick-note capture. Selected items are marked by `--text-primary` weight against `--text-secondary` siblings — no pill, no highlight bar. Below `1024px` it becomes a full-width overlay.

### Modals

`rounded-ui` (6px), `--bg-primary`, 1px `--border-subtle`, `p-8`, `shadow-2xl`, default `w-96`. The close control is a 36px `rounded-ui` icon button pinned top-right — the same rounded square as the panel holding it. Footer buttons are the uppercase text-only pair described above, each `flex-1` so they split the row evenly.

**Ask only before what cannot be undone.** A note moved to the trash goes at once, and a notice at the bottom (`role="status"`, the one radius, `shadow-2xl`) says so with an Undo action for 8 seconds; the timer pauses while the pointer or focus is on it. A confirmation dialog is kept for what is lost for good: a folder, several notes at once, emptying the trash, a new access token.

**Phone bottom bar.** Below `sm` each note action is a 44px column, icon over one short word (`editor.footerShort`), so nothing is a bare icon on a device without tooltips. Six fit at 360px; pinning moves into the ⋯ menu there.

### Cards and the note header

- **Card text** is the note's words, not its Markdown (`lib/card-excerpt.js`): no code, table rules, task boxes or callout markers. After a heading, a list item or a table row the next line follows ` · `, so a list reads `milk · bread · coffee`; running sentences join with a space.
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
- **Focus mode leaves only the text**: the sidebar closes and comes back as it was, the bottom bar and stats go, the header folds to the title row with "Leave focus mode · Esc".
- **A long note folds its header** while reading down: the title moves into the top row beside back and the trash, the stats fold away, the toolbar stays. It unfolds near the top (with hysteresis, so it never flickers at the threshold).
- **Outline** has one control, "Outline" in the note header, on every screen: on a wide window it shows or hides the column (hiding is remembered), on a narrow one it opens the panel over the note. The column comes up by itself only from three headings on; a shorter note shows its headings in the text already.

### Note content

The editor renders Markdown constructs that a CommonMark parser does not know, and it writes them back unchanged:

- **Task lists.** A list where every item carries `- [ ]` / `- [x]` becomes a `taskList`. A **mixed** list is split into consecutive runs so plain bullets keep their bullets and tasks keep their checkboxes; the order is preserved and the Markdown round-trips byte-for-byte.
- **Formulas.** `$…$` inline and `$$…$$` as a block, rendered by KaTeX. `$5 and $10` stays text — the marker is only read when a non-space follows the opening `$`.
- **Diagrams.** A ```mermaid fence becomes a rendered diagram, coloured from the live CSS variables so it follows the active theme. A diagram that fails to parse shows its source in `--red` rather than disappearing.
- **Wiki links.** `[[Note]]` stays text in the file and is drawn as a link: underlined at 40% of `--text-primary`, dashed and `--text-secondary` when no note answers. With the caret in a link, a small bar under it (the one radius, `shadow-xl`) opens the note, creates a missing one, or lists the notes that share the name. Clicking only places the caret, so the link text stays editable; Ctrl/⌘+click and Ctrl/⌘+Enter open it at once.
- **The raw mode** is the same note as plain Markdown, toggled from the editor toolbar, for when the rich editor rebuilds something differently than intended. Because a note is a file in git, seeing the exact bytes matters.

## Do's and Don'ts

### Do:

- **Do** read every color through `var(--token)` and every family through `var(--font-family)`; use `.font-mono` only for code.
- **Do** check a new screen in JetBrains Mono and in one sans and one serif from the library: hierarchy must hold in all three, through size and weight alone.
- **Do** keep surfaces flat at rest and let hover supply the lift — a 0.5px rise with `shadow-xl` is the system's only standard "this is alive" signal.
- **Do** set metadata uppercase at `9–10px` with `0.1–0.16em` tracking, at or below `--text-secondary` opacity.
- **Do** express a note's color as a 13% tint plus an 18% blurred glow.
- **Do** use the one radius, `rounded-ui` (6px), for every rectangle. To change the corners, change `--radius` in `app.css`.
- **Do** extend the system by adding a token to `lib/themes.js` and confirming it across all six palettes.

### Don't:

- **Don't** hard-code a font family in a component. A literal family bypasses the person's choice and puts a second face on screen; add a family to `lib/fonts.js` instead, with a fallback stack of its own category.
- **Don't** introduce filled, bordered, or pill-shaped buttons. Text-only uppercase is the button, and a filled CTA would be the single most "designer-made" thing this app could do.
- **Don't** draw a square control as a circle. A round close button on a rounded card reads as two design systems at once, because the eye compares corner curvature before it reads anything.
- **Don't** let one surface change its radius per breakpoint. Density changes size and padding; the shape stays.
- **Don't** use pure white or pure black as surfaces, and don't reach for neutral greys — the palette is warm paper by construction.
- **Don't** give a permanent surface a resting shadow. Depth is a state response.
- **Don't** use a functional accent color for decoration. Clay Red, Ember Orange, and Ochre Yellow mean error, warning, and pending; spending them on style spends their meaning.
- **Don't** add animation that isn't a state change. The system moves at `duration-200` on `transition-colors` and goes no further.