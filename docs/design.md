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
- The app and the public site share one look: the look of the approved app draft,
  which follows the public site. Ink on paper, warm greys, one blue, one orange,
  4px corners, Inter Tight with Newsreader for ledes and DM Mono for labels.

## Colour

The palette lives as raw tokens on `:root` and `.dark` in
`packages/ui/src/styles/globals.css`, and every shadcn token maps onto it.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ink` | `#111111` | `#f4f3ef` | Text, the primary fill, the active tab line |
| `--ink-60` to `--ink-80` | ink at 60 to 80% | | Secondary and body text |
| `--paper` | `#ffffff` | `#0c0c0d` | Canvas, cards, popovers |
| `--off` | `#faf9f6` | `#141415` | Sidebar, muted fills, group rows, the open row |
| `--tile` | `#f1eee9` | `#1c1c1e` | Chips, the active nav row, the active segment |
| `--line` | `#dedbd6` | `#2a2a2d` | Every hairline and input edge |
| `--line-strong` | `#d3cec6` | `#3b3b3f` | Outline buttons, dashed tiles |
| `--blue` | `#0007cb` | `#5b6cff` | Links, customers, won, focus ring |
| `--orange` | `#ff5600` | `#ff7a33` | Win back, high potential |
| `--active` | black 3% | white 4% | Hover of a row or a quiet control |
| `--dot` | ink 22% | ink 22% | A faint status dot |

**Ink is the one filled action.** `--primary` is ink with paper text: one primary
button per view, beside an underlined text link. `--destructive` is the fill for
the one thing you cannot undo, always behind a confirmation that names the count.
Everything else is a quiet control: a hairline on paper.

**Blue and orange are signals, not decoration.** Blue marks a link, a customer, a
won deal, a positive change and the focus ring. Orange marks Win back and high
potential. A status is a 7px dot in front of a word (`Status` in
`packages/ui/src/components/mark.tsx`): blue, ink, orange, the faint `--dot`, or a
hollow ring for "no verdict". Never colour a whole row, a card edge or a button
with them. `--success` and `--info` map to blue and `--warning` to orange, so old
status code reads in the same two signals.

Dark follows the device (`next-themes` with `system`), and the theme switch sits in
the account row and the mobile top bar. Both themes are complete; neither is the
default look.

## Type

Inter Tight for everything, Newsreader at weight 300 for a page's lede and an email
draft's body, DM Mono for labels. The fonts load once in the root layout as
`--font-site-sans`, `--font-site-serif` and `--font-site-mono`.

- Weights stop at 500: 300, 400, 500. `font-semibold` and heavier resolve to 500.
- Page title: 24px (`text-2xl`), weight 400, `tracking-tight`.
- Section title: 16px, weight 500.
- Body: 14px. Table cells and secondary lines: 13px (`text-2sm`).
- Label: `MonoLabel`, 11px (`text-2xs`) DM Mono in capitals with
  `tracking-label` (0.06em). Table headers, eyebrows, field group headings,
  counts in the sidebar and KPI captions use it.
- Numbers that line up use `tabular-nums`; amounts on cards use DM Mono.

No em dash or en dash in any visible text, in any language. A range reads "1 to
25 of 312", an empty cell shows a faint middle dot.

## Corners and surfaces

`--radius` is 4px and `rounded-md` through `rounded-4xl` all return it. `rounded-sm`
and `rounded-xs` are 2px, for chips, checkboxes and segments. `rounded-full` is
for true circles only: avatars of people, status dots, the switch.

Elevation comes from a hairline (`--line`), never from a drop shadow. The one
exception is a layer that floats over content: menus, popovers, dialogs and the
selection bar carry `--shadow-lg`. Nothing carries a gradient.

Corner marks are the signature: 8px squares at the corners of one framed block
per view, blue for the KPI strip and an email draft. Use them once per view.

## Controls

| Control | Size | Look |
| --- | --- | --- |
| Button `default` | 32px, 12px inline padding, 14px text, weight 400 | Ink fill, paper text; hover 80% |
| Button `sm` | 28px, 13px text | The toolbar chip |
| Button `outline` | | `--line-strong` hairline on paper, hover `--active` |
| Button `ghost` | | No edge until hover |
| Button `link` | | Underlined, 3px offset, ink 80% to ink on hover |
| Button `text` size | No height, no padding, 13px | A `link` that sits inside a sentence or a card footer |
| Button `dashed` | | Dashed `--line-strong`, muted text; quick filters and "Add a deal" |
| Icon button | 32px (`icon`), 28px (`icon-sm`) | |
| Input, select trigger | 32px, 10px inline padding | `--line` edge on paper, the focus ring is blue |
| Badge | 20px, 6px inline padding, 12px | `--tile` chip, 2px corners |
| Segmented control | 2px padding, 24px segments, 13px | Active segment `--tile`, never a fill colour |
| Line tabs | 40px, 14px | 1px ink line under the active tab |
| Checkbox | 14px, 2px corners | Ink when checked |
| Textarea `draft` | No edge, Newsreader 300, 17px | A dashed hairline while a mail draft is edited in place |

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
on desktop for two columns and a drawer on a phone. The header holds the avatar
(round for a person, square for a company), the name at 22px, a muted line with
title, company and place, and on the right a text link, at most one outline button
and the one primary button. A row of chips states the standing, the potential and
the facts the mail gave. Below, a 300px rail lists the fields in groups under mono
headings, each field a muted label with a small icon and a one-line value; the
main side has line tabs.

## The Win back person

A person in Win back opens a page, not a sheet: `/<slug>/win-back/<contactId>`, so
the back button returns to the list and a link names one person. The page is
"understand first": the gist in Newsreader, the progress steps, the timeline "Your
time together", three numbered chapters with one quote, and a second tab with the
person's mail where the passages the story builds on are marked. Every part links to
its mail.

The next step is one `DraftCard` with corner marks. From 1180px (`split:`) it is a
sticky right column, `container-aside` wide (360px, 400px from 1400px), beside a
story column of `container-story` (720px). Below 1180px it follows the story in one
column and an `ActionBar` fixed to the bottom repeats the one action; toasts rise
above it through `--toast-lift`. The parts live in
`packages/ui/src/components/story.tsx`.

## Shell

The app shell is a labelled sidebar, `container-sidebar` (224px) on `--off` with a
hairline on its right: the wordmark, the workspace name as a mono label with a blue
square, then Overview, Win back (with the number of companies), Companies,
Contacts, Deals and Chat as 32px rows with 4px corners. The active row fills with
`--tile` and its label goes to weight 500. A hairline separates Settings (a gear),
the enrichment queue and the account row with the theme switch. Icons come from
`packages/ui/src/components/line-icons.tsx`. Below 1024px the sidebar is a sheet
behind the menu button of a 48px top bar that holds the wordmark, the theme switch
and the menu. Settings has its own second sidebar with the same rows under a mono
"Settings" label.

A page head is an eyebrow (`PageShellEyebrow`: a square and a mono label, blue, or
orange for Win back), the title, a serif lede, and on the right the text link and
the primary button.

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

The public site is the `(landing)` route group: marketing pages, docs, sign-in,
onboarding, grant-access, contact, privacy and imprint. Its design lives in a
second token scope, `.site`, in `packages/ui/src/styles/site.css`: paper and ink
greys, one blue for reading and one orange for win back, 4px corners, Inter Tight,
Newsreader for ledes, DM Mono for labels. The same file holds the site's type
scale, weights, spacing rhythm and hairlines as `--site-*` variables, light under
`.site` and dark under `.dark .site`. Every selector in it is scoped to `.site`,
because a stylesheet a route group loads stays loaded after client navigation into
the app.

`app/(landing)/layout.tsx` loads the stylesheet, nothing else. The three fonts
load once in the root layout as `--font-site-*` variables, because the app uses
them too. A page enters the scope only when its
shell puts the `.site` class on its root: `LandingShell`, `AuthShell` (sign-in,
onboarding, grant-access) and the 404 page, which lives outside the route group and
loads the stylesheet itself. `AuthShell` sets one card on the paper: the
`--tile` fill with ink corner marks, `--site-auth-width` wide, on a dot grid.

The shared components from `packages/ui` render inside `.site` with the app's
tokens, which are the same palette. The site differs in size, not in colour: a
component reaches the site's sizes through a `site:` class in `packages/ui`, never
at the call site.
`Button`, `Input`, `InputGroup`, `Textarea`, the `Select` trigger, `Label` and the
`Field` texts, `Toggle` and `ToggleGroup`, `Badge`, `Alert`, `CardTitle` and
`EmptyTitle` carry these classes: 4px corners, 40px buttons and fields, 16px
field text, 14px labels and help text, and weights of 400 and 500. Inside `.site`
the default `Badge` is the blue label: `--blue` fill, `--on-blue` text, DM Mono in
capitals. `Switch` is a 36 by 20 box with an ink edge and a square knob, not a
pill. The default `TabsList` is a row of bordered cells, 58px tall with 20px text,
the active cell on `--off`; the `line` tabs keep their shape. `Table` holds a
`--site-table-min` (560px) floor instead of a width per cell: it fits every
desktop column and scrolls inside its own frame on a phone. A row header is
`TableHead scope="row"`: body text in `--muted-foreground` (`--ink-60` inside
`.site`), no capitals, top aligned on the site. A side column beside a picker or a
form is `--site-aside` (400px) wide.

A menu, a popover or a toast opened from a public page is portalled to `<body>`,
outside the shell. Each site shell renders `SiteShellMarker`
(`components/site/site-shell-marker.tsx`), which sets `data-site-shell` on
`<body>` in a layout effect and removes it in the cleanup. The `site:` variant
(`.site *, [data-site-shell] *`) and the token block (`body[data-site-shell]`)
use that marker, so the portalled layers take the site tokens, 4px corners and
Inter Tight. The marker follows visibility, not presence in the DOM: Next keeps a
page the visitor left as a hidden subtree, and React runs the layout cleanup when
it hides that subtree, before the next frame paints. A visible app page therefore
never has the marker on `<body>`. A hidden site page can stay in the DOM with its
`.site` class, but that class styles only its own hidden subtree.

The type scale is a set of `--site-text-*` sizes that step down with the
viewport, composed with leading and tracking in `SITE_TYPE`
(`components/site/typography.ts`). A page never writes a pixel size; it picks the
role:

| Role | `SITE_TYPE` | Desktop | 1340px and below | 900px and below | 480px and below |
| --- | --- | --- | --- | --- | --- |
| Hero and closing headline | `display1` | 80 | 80 | 40 | 36 |
| Section headline | `display2` | 54 | 54 | 34 | 34 |
| Headline beside a picture | `display3` | 44 | 40 | 34 | 34 |
| Large measured number | `figure` | 64 | 64 | 48 | 48 |
| Price | `amount` | 64 | 64 | 44 | 44 |
| Word between two prices | `plus` | 32 | 32 | 40 | 40 |
| Quote in a numbers card | `quote` | 28 | 28 | 24 | 24 |
| Card title | `title24` | 24 | 24 | 22 | 22 |
| Item title | `title20` | 20 | 20 | 20 | 20 |
| Lede | `lede` | 16 serif | 16 | 16 | 16 |
| Label | `mono` | 12 mono | 12 | 12 | 12 |

The header banner carries `data-slot="site-banner"`. While it is on the page,
`.site` sets `--site-banner-offset` to the banner height; once it is closed the
offset is 0. A sticky element below the header adds the offset, never the banner
height, so closing the banner leaves no gap.
Fields meet WCAG AA on every site surface (paper, off, tile) in both themes: the
field edge is `--field` (3:1 or more), placeholders use `--ink-60` (4.5:1 or
more). `--destructive` differs per theme, in the app and inside `.site`:
`#b3261e` in light, `#eb5757` in dark, because error text sits on the light tile
and `#eb5757` reaches only 3:1 there.
A product image may carry the one shadow token `--shadow`; nothing else in `.site`
has a shadow. Marketing blocks live in `apps/app/components/site/` (public) or
`components/landing/` (hosted overlay). The app never renders inside `.site`.

A product image shows invented sample data only, captured from a disposable
database with the built-in sample data. Each file is listed in
`public/site/shots/MANIFEST.md` with its source. A capture from a real workspace
is never committed. A page shows one through `Shot` from
`components/site/shot.tsx`, which takes a name from `SHOTS` in
`components/site/site-config.ts` and renders the light and the dark file, so the
image follows the theme button. A German reader gets the German set from
`public/site/shots/de/`, every other reader the English set. Its alt text goes
through `t()`.

The theme default is chosen per route group in `apps/app/lib/theme-config.ts`.
The app and the public site both follow the device. Each stores the person's
choice under its own key, so a choice made on the site never changes the app.
Sign-in, onboarding and grant-access are part of the site and follow its theme.
Entering the app from them is either a full page load or a navigation that
crosses the scope, and both paint the app in its own theme from the first frame.
