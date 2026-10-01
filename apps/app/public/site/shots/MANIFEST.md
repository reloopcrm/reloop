# Product shots

Example data only. Every image shows the app's built-in sample data from `apps/api/src/demo/demo-data.ts`: invented companies and people on `.example` domains. Two more things were invented for the capture and are not in the demo seed: the signed-in user Lena Hoffmann with the workspace Nordlicht Beratung, and one follow-up draft for Chiara Benvenuti (Verdalba Hotels Srl).

Captured from the Reloop app at commit 5373ac9 against a separate, disposable local database (`crm_preview`), never a real workspace. The sample data banner and the Next.js dev indicator are hidden. UI language: English.

Each file is a WebP (`cwebp -q 82`) of the 2x PNG named in Source, scaled to at most 1600 px wide. `next/image` serves the 1x and 2x widths from it.

| File | Shows | Theme | Size (px) | Source | Example data only |
| --- | --- | --- | --- | --- | --- |
| hero-overview-light.webp | Whole app: sidebar plus overview with KPIs, chart and deals in progress | light | 1600x1000 | `crops/10-hero-app-overview-1280x800-light.png` | yes |
| hero-overview-dark.webp | Whole app: sidebar plus overview with KPIs, chart and deals in progress | dark | 1600x1000 | `crops/10-hero-app-overview-1280x800-dark.png` | yes |
| win-back-light.webp | Win back list: companies ranked by what happened in mail | light | 1600x1000 | `02-win-back-light.png` | yes |
| win-back-dark.webp | Win back list: companies ranked by what happened in mail | dark | 1600x1000 | `02-win-back-dark.png` | yes |
| contact-activity-light.webp | Contact sheet (Chiara Benvenuti) over Win back, Activity tab | light | 1600x1000 | `03-contact-sheet-activity-light.png` | yes |
| contact-activity-dark.webp | Contact sheet (Chiara Benvenuti) over Win back, Activity tab | dark | 1600x1000 | `03-contact-sheet-activity-dark.png` | yes |
| follow-up-draft-light.webp | Follow-up draft dialog over the Win back list | light | 1600x1000 | `04-follow-up-draft-light.png` | yes |
| follow-up-draft-dark.webp | Follow-up draft dialog over the Win back list | dark | 1600x1000 | `04-follow-up-draft-dark.png` | yes |
| contacts-light.webp | Contacts list | light | 1600x1000 | `06-contacts-light.png` | yes |
| contacts-dark.webp | Contacts list | dark | 1600x1000 | `06-contacts-dark.png` | yes |
| companies-light.webp | Companies list | light | 1600x1000 | `07-companies-light.png` | yes |
| companies-dark.webp | Companies list | dark | 1600x1000 | `07-companies-dark.png` | yes |
| follow-up-dialog-light.webp | Follow-up draft dialog, no overlay | light | 1376x1348 | `crops/01-follow-up-draft-dialog-light.png` | yes |
| follow-up-dialog-dark.webp | Follow-up draft dialog, no overlay | dark | 1376x1348 | `crops/01-follow-up-draft-dialog-dark.png` | yes |
| contact-record-light.webp | Contact record sheet panel: header, fields, Activity tab | light | 1600x1206 | `crops/02-contact-record-sheet-light.png` | yes |
| contact-record-dark.webp | Contact record sheet panel: header, fields, Activity tab | dark | 1600x1206 | `crops/02-contact-record-sheet-dark.png` | yes |
| overview-kpis-light.webp | Overview KPI cards row | light | 1600x325 | `crops/03-overview-kpi-cards-light.png` | yes |
| overview-kpis-dark.webp | Overview KPI cards row | dark | 1600x325 | `crops/03-overview-kpi-cards-dark.png` | yes |
| overview-chart-light.webp | Overview closed won vs. new pipeline chart card | light | 1376x608 | `crops/04-overview-closed-won-chart-light.png` | yes |
| overview-chart-dark.webp | Overview closed won vs. new pipeline chart card | dark | 1376x608 | `crops/04-overview-closed-won-chart-dark.png` | yes |
| overview-deals-light.webp | Overview deals in progress card | light | 1600x705 | `crops/05-overview-deals-in-progress-light.png` | yes |
| overview-deals-dark.webp | Overview deals in progress card | dark | 1600x705 | `crops/05-overview-deals-in-progress-dark.png` | yes |
| win-back-table-light.webp | Win back table, header plus first 5 rows | light | 1600x542 | `crops/06-win-back-table-top5-light.png` | yes |
| win-back-table-dark.webp | Win back table, header plus first 5 rows | dark | 1600x542 | `crops/06-win-back-table-top5-dark.png` | yes |
| deals-pipeline-light.webp | Deals pipeline, first 3 stage columns | light | 1600x890 | `crops/07-deals-pipeline-3-columns-light.png` | yes |
| deals-pipeline-dark.webp | Deals pipeline, first 3 stage columns | dark | 1600x890 | `crops/07-deals-pipeline-3-columns-dark.png` | yes |
| win-back-compact-light.webp | Compact Win back view, Potential and Verdict columns hidden | light | 1600x1138 | `crops/11-win-back-card-900x640-light.png` | yes |
| win-back-compact-dark.webp | Compact Win back view, Potential and Verdict columns hidden | dark | 1600x1138 | `crops/11-win-back-card-900x640-dark.png` | yes |

A capture from a real workspace is never committed here. See `docs/design.md`, Public site.
