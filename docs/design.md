# Design: Rules for AI Agents

- /packages/ui is the single source of truth for all UI.
- Always use shared shadcn components from /packages/ui.
- Do not override component styles with className.
- Do not introduce custom border radii, spacing, colours, shadows, or other visual deviations.
- Corners are rounded, from the scale only: `rounded-xs` (2px) for the smallest
  marks, `rounded-sm` (4px) for badges, `rounded-md` (6px) for buttons, inputs and
  segments, `rounded-lg` (12px) for surfaces that contain controls: popovers,
  dialogs, menus, table shells. `rounded-full` for pills. That is the whole radius
  vocabulary, it is the same in both themes, and it stops at 12px: `--radius-lg`
  through `--radius-4xl` all hold 12px, so a larger utility returns the same corner.
  Never a literal radius at the call site.
- `rounded-none` is still correct in one case: an element that must join its
  neighbour edge to edge. The input inside an input group, the middle cells of
  a selected date range, and the drawer handle are the existing examples.
- If a component needs a new variant or style, implement it in /packages/ui so the entire application stays consistent.

## Surfaces

Dark is the substrate, not a theme. The canvas is `#08090a`. Every surface climbs
from it: `#0f1011` for cards, popovers and the sidebar, `#161718` for secondary and
muted fills, `#23252a` for accent and tag chips. Light is the faithful counterpart:
`#ffffff` canvas, `#ffffff` card, `#f4f5f6`, `#eaecee`.

**Elevation comes from a hairline border, never from a drop shadow.** `--border`
(`#23252a` dark, `#e3e5e8` light) draws the edge of a surface. `--border-strong`
(`#383b3f`, `#c9ccd1`) draws a separator that must carry across a whole section.
`--shadow-hairline` puts that same line inside the box, for a surface that must not
grow by a pixel. `--shadow-inset` adds depth inside a well. A card that floats on a
drop shadow is wrong: the light ladder starts with paper on paper, so the line is
the only thing that separates the card from the canvas.

## Colour

Flat near black, untinted greys, and one acid lime (`#e4f222`). The greys are
untinted on purpose: there is no scene to tint them toward, and a tinted grey
without a reason reads as indecision.

**Only two things are filled**: `primary` for the action you want, `destructive`
for the one you cannot undo. Everything else, secondary and outline and ghost, is a
dark chip in dark and a white chip in light. That is what keeps a rep's eye landing
on *go* or *stop* and skimming past the rest.

`#e4f222` marks **one action per view**. A second lime button on the same screen
removes the meaning of the first. Lime is never decoration, never a border, never a
hover state.

`--success` (`#27a644`) and `--warning` are **status colours, never action
colours**: a usage meter that is fine, near its limit, or full; a badge that
reports a state. Neither is ever a button fill, a border or a hover state. Lime
stays the one action colour.

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

## Spacing

The base unit is 4px, and every gap is a multiple of it: 4, 8, 12, 16, 20, 24. 8px
separates elements inside one control group. 24px is the gap between blocks and the
inline padding of the page. The page holds 40px above and below. Width comes from
the container tokens: `container-narrow` (560px), `container-sheet` (640px),
`container-page` (820px), `container-page-wide` (1120px). Never a literal width at
the call site.
