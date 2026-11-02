# Design: Rules for AI Agents

- /packages/ui is the single source of truth for all UI.
- Always use shared shadcn components from /packages/ui.
- Do not override component styles with className. `className` places a
  component (width, gap, order, grid area); it never changes its colour, size,
  corner or type.
- Do not introduce custom border radii, spacing, colours, shadows, or other visual
  deviations.
- If a component needs a new variant or style, implement it in /packages/ui so the
  entire application stays consistent.
- The app and the public site share one look, the Mailcheap look
  (github.com/marclou/mailcheap, AGPL v3 like Reloop): untinted greys in oklch,
  near-black on white, surfaces that sit on a soft shadow instead of a drawn
  border, 10px corners, Geist for text, Geist Mono for labels, Newsreader for the
  display headings of the public site.

## Colour

The palette lives as raw tokens on `:root` (light, the default) and `.dark` in
`packages/ui/src/styles/globals.css`, and every shadcn token maps onto it. Every
grey is `oklch(L 0 0)`: no hue, on purpose.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ink` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | Text |
| `--ink-30` to `--ink-80` | ink at 30 to 80% | | Underlines, secondary and body text |
| `--paper` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | Canvas |
| `--off` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | Sidebar; in dark also cards and popovers |
| `--tile` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Muted and secondary fills, chips, the segmented control track |
| `--line` | `oklch(0.922 0 0)` | white 10% | A hairline where one is still drawn: table rows, separators |
| `--line-strong` | `oklch(0.87 0 0)` | white 18% | A stronger separator |
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` | The one filled button, with `--primary-foreground` the inverse |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | Secondary text, labels, placeholders |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | Focus, as a 3px ring at 40% |
| `--blue` | `#0007cb` | `#5b6cff` | Customers, won, a positive change |
| `--orange` | `#ff5600` | `#ff7a33` | Win back, high potential |
| `--active` | black 4% | white 4% | Hover of a row or a quiet control |
| `--dot` | ink 22% | ink 22% | A faint status dot, the dot grid behind a hero |

Cards are white on white in light (`--card` is `--paper`) and a step lighter than
the canvas in dark (`--card` is `--off`). What separates a card from the canvas is
its shadow, not its colour.

**Near-black is the one filled action.** `--primary` is near-black with
near-white text in light, and the inverse in dark: one primary button per view,
beside an underlined text link. `--destructive` (`#b3261e`, `#eb5757` dark) is the
fill for the one thing you cannot undo, always behind a confirmation that names the
count. Everything else is a quiet control: a card-coloured chip on the surface
shadow.

**Blue and orange are signals, not decoration.** Blue marks a customer, a won
deal and a positive change. Orange marks Win back and high potential. A status is
a 7px dot in front of a word (`Status` in `packages/ui/src/components/mark.tsx`):
blue, ink, orange, the faint `--dot`, or a hollow ring for "no verdict". Never
colour a whole row, a card edge or a button with them. `--success` and `--info`
map to blue and `--warning` to orange. A link is ink, underlined in `--ink-30`,
and the underline turns to ink on hover.

Dark follows the device (`next-themes` with `system`), and the theme switch sits in
the account row, the mobile top bar, the site header and the sign-in header. Light
holds the `:root` values and is what a visitor without a preference sees; dark is
the `.dark` block and is complete.

## Elevation

A surface sits on `--surface-shadow`: a 1px ring at 6% black plus two soft layers
(`0 1px 2px -1px` and `0 2px 4px` at 4 to 6%). In dark it is one ring at 8%
white. The shadow replaces the drawn border: a card, a stat group, a chart frame,
a board card, an input, a select trigger, an outline button, the active nav row
and the active segment all carry `border-transparent shadow-surface`. Hover on a
control raises it to `shadow-surface-hover` (8% ring). The primary button carries
`shadow-button`, one 1px drop at 12%.

The ladder above a surface is the shadow scale: `shadow-md` for a popover or a
menu, `shadow-lg` for a dialog, `shadow-2xl` for a floating panel, `shadow-sheet`
for the record sheet (surface plus `0 24px 64px -16px` at 30%). Every step starts
with the surface ring, so a floating layer still has an edge. Nothing carries a
gradient. A plain hairline (`border-border`) remains for a line inside a surface:
table rows, a card footer, a separator, and the solid edge of an empty state.

## Corners

`--radius` is 0.625rem (10px). The scale in `@theme`:

| Utility | Size | Use |
| --- | --- | --- |
| `rounded-xs`, `rounded-badge` | 4px | Checkbox, badge, the smallest chip |
| `rounded-sm` | 6px | A segment, a menu row, a small inset well |
| `rounded-md`, `rounded-lg` | 10px | Buttons, inputs, cards, popovers, dialogs, menus, nav rows |
| `rounded-xl` | 14px | A code figure, a callout, a table frame on the site |
| `rounded-2xl` | 18px | A browser frame around a screenshot |
| `rounded-3xl` | 22px | A bento tile, the stats strip |
| `rounded-4xl` | 32px | The large panel on the site |

`rounded-full` is for true circles only: avatars of people, status dots, the
switch, the segmented hero tabs on the site. Never a literal radius at the call
site.

## Type

Geist for everything, Geist Mono for labels, Newsreader (optical sizing on) for
the display headings of the public site. The three fonts load once in the root
layout as `--font-site-sans`, `--font-site-serif` and `--font-site-mono`
(`apps/app/components/site/fonts.ts`), and `--font-sans`, `--font-serif` and
`--font-mono` in `globals.css` read them. The app never uses the serif: a lede, a
draft and a story are Geist at weight 400.

- Weights: 300, 400, 500, 600. `font-bold` and heavier resolve to 600, so a
  heavier utility gives 600 under a misleading name.
- Page title (`PageShellTitle`): 24px (`text-2xl`), weight 600, `tracking-tight`
  (-0.02em). A card title, a sheet title, a dashboard block title and the chat
  home title follow with weight 600 and `tracking-tight`.
- Page description: 15px (`text-md`), 24px leading, muted.
- Section title: 16px, weight 500.
- Body: 14px. Table cells and secondary lines: 13px (`text-2sm`).
- Label: `MonoLabel`, 11px (`text-2xs`) Geist Mono in capitals with
  `tracking-label` (0.08em). Table headers, eyebrows, field group headings,
  counts in the sidebar and KPI captions use it.
- A KPI value is weight 600 at -0.03em. Numbers that line up use `tabular-nums`;
  the timeline rows and the day strip are tabular throughout.

No em dash or en dash in any visible text, in any language. A range reads "1 to
25 of 312", an empty cell shows a faint middle dot.

## Controls

| Control | Size | Look |
| --- | --- | --- |
| Button `default` | 32px, 12px inline padding, 14px text, weight 400 | `--primary` fill, `shadow-button`; hover 85% |
| Button `sm` | 28px, 13px text | The toolbar chip |
| Button `outline` | | Card fill on `shadow-surface`, hover `--active` and the hover ring |
| Button `ghost` | | No edge until hover |
| Button `nav` | 32px | The sidebar row; the active row is card fill on `shadow-surface` |
| Button `link` | | Underlined, 3px offset, ink 80% to ink on hover |
| Button `text` size | No height, no padding, 13px | A `link` that sits inside a sentence or a card footer |
| Button `dashed` | | Dashed `--line-strong`, muted text; quick filters and "Add a deal" |
| Icon button | 32px (`icon`), 28px (`icon-sm`) | |
| Input, select trigger, input group | 32px, 10px inline padding | Card fill on `shadow-surface`, no drawn edge; focus is a 3px ring at 40% |
| Textarea | | Same fill and shadow with `rounded-lg`; the `draft` variant has no edge, Geist 400, 17px, a dashed outline while a mail draft is edited in place |
| Badge | 20px, 6px inline padding, 12px | `--tile` chip, 4px corners |
| Segmented control (`Tabs` default, `ToggleGroup`) | 2px padding, 24px segments, 13px | `--muted` track on `shadow-surface`; the active segment is card fill on `shadow-surface` |
| Line tabs | 40px, 14px | 1px ink line under the active tab |
| Checkbox | 14px, 4px corners | Ink when checked |
| Table | | 36px mono header, rows split by `--line` hairlines, no vertical lines |

A header, a card footer and a dialog pair one primary button with one underlined
text link. A second filled button on a screen removes the meaning of the first.

## Lists

Every list is a `DataTable` from `packages/ui`, and the rules below live in that
component. A view never rebuilds them.

- **No horizontal scrolling, anywhere.** Columns have a fixed width in px
  (`size` on the column). `fitColumnWidths` in `packages/ui/src/lib/table-config.ts`
  shrinks them to the room the table has; the first column takes the rest and
  keeps at least 180px. The table clips; it never scrolls sideways.
- **One line per cell.** Long values end in an ellipsis. A second line under a name
  is not allowed in a list.
- **Few columns by default.** A list shows four or five columns. Every other column
  is in the Columns menu (`defaultHidden`), which shows the visible count.
- **The row is the link.** Clicking anywhere on a row opens the record, Enter does
  the same. Win back is the one exception: a company row expands to show its
  people, even one person; a person row opens the person; the company record opens
  through the small arrow after the company name.
- **Headers** are mono labels with a small icon. A sortable header sorts on click
  and shows the direction with an arrow.
- **Toolbar**: search, Filter (field, then values), one removable chip per active
  filter, quick filters as dashed chips, then on the right Columns and the More
  menu (export, archived). Two more controls are allowed: the Me / Everyone
  switch where a list has an owner scope, and the Saved views menu. A list adds no
  other buttons to its toolbar.
- **Selection**: a checkbox shows on row hover and stays once one row is picked;
  shift-click picks a range; the header box picks the page. A bar floats at the
  bottom centre with the count, the view's actions inline, and Clear selection;
  Esc clears. The list adds room below itself so the bar never covers the last row
  or the pager. Only actions the API supports appear; a destructive one sits behind
  a dialog that names the count.
- **Pages**, never endless scroll: the range, page numbers, previous and next, and
  25, 50 or 100 rows per page. The page, the size, the sort, the search and the
  filters live in the URL, so a reload or a shared link shows the same view.
- **Empty filter result**: a sentence and Reset filters.
- **Phones (below 1024px)**: every row is a card. The first column is the title
  line, every other visible column a labelled field, two to a line.

## Records

A record opens in a sheet addressed by the URL (`?record=contact:<id>`), wide enough
on desktop for two columns and a drawer on a phone. The sheet has no drawn edge; it
floats on `shadow-sheet`. The header holds the avatar (round for a person, square
for a company), the name at 22px and weight 600, a muted line with title, company
and place, and on the right a text link, at most one outline button and the one
primary button. A row of chips states the standing, the potential and the facts
the mail gave. Below, a 300px rail lists the fields in groups under mono headings,
each field a muted label with a small icon and a one-line value; the main side has
line tabs.

## The Win back person

A person in Win back opens a page, not a sheet: `/<slug>/win-back/<contactId>`, so
the back button returns to the list and a link names one person. The list's search,
filters and sort travel in the person's URL, so the breadcrumb returns to the same
list and "Continue with" follows its order. The page is "understand first": the
gist at 19px, the progress steps, the timeline "Your time together", three numbered
chapters with one quote, and a second tab with the person's mail where the passages
the story builds on are marked. Every part links to its mail.

The next step is one `DraftCard`. From 1180px (`split:`) it is a sticky right
column, `container-aside` wide (360px, 400px from 1400px), beside a story column
of `container-story` (720px). Below 1180px it follows the story in one column and
an `ActionBar` fixed to the bottom repeats the one action; toasts rise above it
through `--toast-lift`. The parts live in `packages/ui/src/components/story.tsx`.

## Shell

The app shell is a labelled sidebar, `container-sidebar` (224px) on `--off` with a
hairline on its right: the wordmark, the workspace name as a mono label with a blue
square, then Overview, Win back (with the number of companies), Companies,
Contacts, Deals and Chat as 32px rows with 10px corners. The active row is a card
on `shadow-surface` and its label goes to weight 500. A hairline separates
Settings (a gear), the enrichment queue and the account row with the theme switch.
Icons come from `packages/ui/src/components/line-icons.tsx`. Below 1024px the
sidebar is a sheet behind the menu button of a 48px top bar that holds the
wordmark, the theme switch and the menu. Settings has its own second sidebar with
the same rows under a mono "Settings" label.

A page head is an eyebrow (`PageShellEyebrow`: a square and a mono label, blue, or
orange for Win back), the title at weight 600, a 15px muted description, and on
the right the text link and the primary button.

## Spacing

The base unit is 4px; gaps are 4, 8, 12, 16, 20, 24. 8px separates the controls of
one group, 24px separates blocks. The page holds 32px at the sides, 28px at the top
and 56px at the bottom on desktop (`--spacing-page-inline`, `--spacing-page-top`,
`--spacing-page-bottom`) and 16px on a phone. Width comes from the container
tokens: `container-narrow` (560px), `container-sheet` (640px), `container-page`
(820px), `container-page-wide` (1440px), `container-sidebar` (224px). Never a
literal width at the call site; a list column's `size` is the one sanctioned px
value, because it is data the table fits.

## Public site

The public site is the `(landing)` route group: docs, sign-in, onboarding,
grant-access, contact, privacy and imprint, plus the 404 page outside the group.
It is built from one component set, `apps/app/components/landing/mailcheap/`,
and one stylesheet, `mailcheap.css`, which the shell (`shell.tsx`) and the auth
frame (`auth.tsx`) import. Every rule in it is scoped to `.mc` and sits in
`@layer components`, so a Tailwind utility on the same element still wins and the
stylesheet stays harmless after client navigation into the app.

The `.mc` block holds no colour of its own. Every `--mc-*` variable reads the
shared token (`--mc-card` is `--card`, `--mc-shadow-border` is
`--surface-shadow`, `--mc-font-display` is `--font-serif`), so the site follows
the same theme switch as the app and the same light default.

The parts:

- `LandingShell` (`components/docs/landing-shell.tsx`) wraps a page in `.mc`:
  the skip link, `SiteHeader` (wordmark, the header links from `MARKETING_NAV`,
  Sign in, the Get started pill when a sign-up exists, the theme switch, the
  `details` menu below 640px), `main#content`, and `SiteFooter` (wordmark and
  tagline, the link groups, the AGPL line, the legal links and the language
  switcher).
- `Article` (`article.tsx`) is the frame of a docs page, a trust page and the
  imprint: a sticky left rail of link groups and "On this page" from 768px, a
  42rem column with a mono kicker, a Newsreader title, a lede and the body.
  `ArticleSection` gives a section its anchor and `h2`. `Cards`, `Card`,
  `Steps` and `Step` are its building blocks.
- `DocsArticle` (`docs.tsx`) is `Article` with the docs rail and the previous
  and next pager. `SiteMarkdown` (`markdown.tsx`) renders the parsed guide:
  `h1` to `h4` with anchor ids, `CodeFigure` with the copy button, a callout
  with a square mark, a table in a rounded frame, lists and paragraphs.
- `PageHero`, `SectionHead`, `Section`, `Split`, `Tiles`, `TextTile`, `Faq`,
  `Closing`, `CodeFigure`, `Note` and `Actions` (`parts.tsx`) are the marketing
  blocks. `Actions` pairs one `mc-btn` with one underlined `mc-link`.
- `AuthSplit` (`auth.tsx`) is the frame of sign-in, onboarding, grant-access and
  consent through `AuthShell`: a 22rem form column with the wordmark, the theme
  switch and the language switcher, and from 1024px an aside with a kicker, a
  Newsreader headline, the tagline and a product shot in a `BrowserFrame`.
  `AuthHeading` is the title and intro of the form.
- `Shot` (`shot.tsx`) renders the light and the dark screenshot and shows the one
  the theme asks for.

The site's own vocabulary, in `mailcheap.css`: `mc-h1` and `mc-display` are
Newsreader at 420 to 520 with tight tracking; `mc-lede` is 18px muted; `mc-kicker`
is the 11px mono label; `mc-btn` is a 36px near-black button at 10px corners with
`mc-btn-lg` (40px), `mc-btn-sm` (28px), `mc-btn-ghost` and `mc-btn-outline`;
`mc-card` and `mc-tile` are surfaces on the surface shadow; `mc-dots` is the dot
grid that fades out behind a hero. The forms inside the auth frame use the shared
`Button`, `Input` and `Field` from `packages/ui`, so a control looks the same on
the site and in the app.
