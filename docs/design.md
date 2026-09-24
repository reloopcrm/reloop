# Design: Rules for AI Agents

- /packages/ui is the single source of truth for all UI.
- Always use shared shadcn components from /packages/ui.
- Do not override component styles with className.
- Do not introduce custom border radii, spacing, colours, shadows, or other visual deviations.
- Corners are rounded, from the scale only, and **the pill is the default for
  every control**: `rounded-full` for buttons, tags and badges, inputs, select
  triggers, segmented controls and sidebar items. `rounded-lg` (12px) for every
  surface that holds content or controls: cards, table shells, popovers, dialogs,
  menus, textareas. `rounded-md` (6px) for a menu row or a small inset well,
  `rounded-sm` (4px) for a checkbox, `rounded-xs` (2px) for the smallest marks.
  That is the whole radius vocabulary, it is the same in both themes, and it stops
  at 12px: `--radius-lg` through `--radius-4xl` all hold 12px, so a larger utility
  returns the same corner. Never a literal radius at the call site.
- `rounded-none` is still correct in one case: an element that must join its
  neighbour edge to edge. The input inside an input group, the middle cells of
  a selected date range, the underline tab and the drawer handle are the existing
  examples.
- If a component needs a new variant or style, implement it in /packages/ui so the entire application stays consistent.

## Controls

A button is a pill: 36px tall (`size="default"`), 32px (`sm`), 28px (`xs`), 40px
(`lg`), 44px (`xl`), text 14px at weight 510, 18px of inline padding. An icon-only
button is a round 36px disc (`size="icon"`). `outline` draws a `--border-strong`
hairline on a transparent chip; `ghost` has no edge until hover; `nav` is the
sidebar row. **A primary action pairs with an underlined text link**, never with a
second filled button: `variant="link"` is always underlined, in `--border-strong`,
3px below the text, and the underline turns to the text colour on hover. That pair
is the whole action vocabulary of a header, a card footer and a dialog.

A tag or badge is a 22px pill with 10px of inline padding, text 12px at 510. The
default chip is `--tag` on `--tag-foreground`, the grey chip. `primary` exists for
the one lime badge a view earns; it follows the same one-per-view rule as the
button.

A segmented control is one pill container (`--card` fill, hairline border, 3px of
padding) holding 30px pill segments. **The active segment is lime**: `--primary`
fill with `--primary-foreground` text, the same pair as the primary button. Both
`Tabs` (default variant) and `ToggleGroup` render this way, so a page picks by
semantics, not by look: `Tabs` switches content, `ToggleGroup` switches a value.
`TabsList variant="line"` is the other tab: 40px tall text with a 2px lime
underline under the active item, for the tabs of a record sheet. Those two are the
only places lime appears without being a button.
`ToggleGroup variant="quiet"` fills the active segment with `--muted` instead.
It is for a form that asks several questions on one screen, where lime would mark
every answer and leave nothing for the one action.

Inputs and select triggers are 36px pills with 14px of inline padding, `--card`
fill, `--input` hairline, `--faint-foreground` placeholder, no inset shadow.
Textareas keep the same fill and edge with `rounded-lg`, because a pill cannot
hold three lines. Focus is the ring, never a glow.

A table is a 12px shell with a `--muted` header row (40px, text 12px muted) and
rows separated by `--border` hairlines. Cells hold 16px of inline padding and 12px
vertical, 14px text, and a row with two lines of text lands at 54px.

A progress bar is a 4px pill on `--accent`, the bar in a status colour.

## Surfaces

Dark is the substrate, not a theme. The canvas is `#08090a`. Every surface climbs
from it: `#0f1011` for cards, popovers, inputs and the sidebar, `#161718` for
secondary and muted fills, `#23252a` for accent and tag chips. Light is the
faithful counterpart: `#ffffff` canvas, `#ffffff` card, `#f4f5f6`, `#eaecee`.

**Elevation comes from a hairline border, never from a drop shadow.** `--border`
(`#23252a` dark, `#e3e5e8` light) draws the edge of a surface. `--border-strong`
(`#383b3f`, `#c9ccd1`) draws a separator that must carry across a whole section,
and the edge of an outline button. `--shadow-hairline` puts that same line inside
the box, for a surface that must not grow by a pixel. Nothing carries a gradient.
A card that floats on a drop shadow is wrong: the light ladder starts with paper on
paper, so the line is the only thing that separates the card from the canvas.

## Colour

Flat near black, untinted greys, and one acid lime (`#e4f222`). The greys are
untinted on purpose: there is no scene to tint them toward, and a tinted grey
without a reason reads as indecision.

**Only two things are filled**: `primary` for the action you want, `destructive`
for the one you cannot undo. Everything else, secondary and outline and ghost, is a
dark chip in dark and a white chip in light. That is what keeps a rep's eye landing
on *go* or *stop* and skimming past the rest.

`#e4f222` marks **one action per view**. A second lime button on the same screen
removes the meaning of the first. Lime is never decoration, never a hover state,
never a card edge. The active segment of a segmented control and the underline of
the active line tab are the two sanctioned exceptions: there the lime says "you
are here", and a view holds one segmented control at most beside its one primary
button.

`--success` (`#27a644`) and `--warning` are **status colours, never action
colours**: a usage meter that is fine, near its limit, or full; a badge that
reports a state. Neither is ever a button fill, a border or a hover state. Lime
stays the one action colour.

One exception, asked for by the owner: a quantity stepper. `Button
variant="success"` fills the "+" with `--success`, and `variant="destructive"`
fills the "−" beside it. Both are round icon buttons (`size="icon-sm"`), both
open a confirmation before anything is billed, and neither appears anywhere
else. The usage page's add-ons are the only stepper today.

`--primary` and `--destructive` hold the **same value in both themes**. A brand
colour that changes per theme is not one colour, it is two, and both then need
maintaining. `--primary-foreground` is `#08090a` in both themes, so the accent
always carries dark text. The single exception is `--ring`, which darkens in light
through `--primary-strong`: a fill carries the brand, but a ring only has to be
seen, and `#e4f222` is too bright to register on paper.

## Type

Inter, with `"cv01" on, "ss03" on, "zero" on` and `font-optical-sizing: auto` set on
`body`. Those alternate glyphs are the typographic identity, so a component that
drops them looks foreign. Body tracking is `-0.011em`. Display sizes take
`tracking-tight` (`-0.022em`).

The scale is 12px (`text-xs`), 13px (`text-2sm`), 14px (`text-sm`), 15px
(`text-md`), 16px (`text-base`), then the headings. 13px is the secondary line: a
card description, a segment label, a table caption, the second line of a row. A
page title is `text-2xl` at 590, compact, with a 14px muted description one line
below. A card or section title is `text-md` at 590.

**Weights stop at 590.** The scale is 300, 400, 510, 590, and emphasis runs 400 to
510 to 590. The theme enforces the cap: `font-bold`, `font-extrabold` and
`font-black` all resolve to 590, so a heavier utility gives the same weight under a
misleading name. Past 590 the second lever is colour: `foreground`,
`body-foreground`, `muted-foreground`, `faint-foreground`.

One exception, for the public site only: `Display` from `packages/ui` sets landing
headlines in weight 900 through `font-display`. The app never uses it. A screen
inside the product that reaches for `Display` is wrong.

`font-mono` is for identifiers, keyboard shortcuts and technical metadata. Never for
a heading.

## Shell

The app shell is a labelled sidebar, not an icon rail. It is `container-sidebar`
(224px) wide on `--sidebar` with a `--border` hairline on its right: the wordmark
and the workspace name at the top, then the six sections in this order, Overview,
Win back, Companies, Contacts, Deals, Chat, as 36px pill rows (`Button
variant="nav"`) with the icon in `--muted-foreground` and the label at 400. The
active row fills with `--accent`, its text and icon go to `--foreground` and the
label to 510. Settings sits at the bottom, then a hairline, then the enrichment
queue and the account row. Between `md` and `lg` the sidebar collapses to
`container-rail` (56px): icons only, labels in tooltips, the favicon in place of
the wordmark. Below `md` it is a sheet behind the menu button of the 48px top bar,
and the sheet shows the same list with labels. Settings has its own second sidebar
of the same width and the same rows, with a 12px "Settings" label above them.

## Spacing

The base unit is 4px, and every gap is a multiple of it: 4, 8, 12, 16, 20, 24. 8px
separates elements inside one control group, 16px separates a primary button from
its text link. 24px is the gap between blocks. The page holds 40px on every side
on desktop (`--spacing-page-inline`, `--spacing-page-top`, `--spacing-page-bottom`)
and 16px on a phone. Width comes from the container tokens: `container-narrow`
(560px), `container-sheet` (640px), `container-page` (820px), `container-page-wide`
(1120px), `container-sidebar` (224px), `container-rail` (56px). Never a literal
width at the call site.
