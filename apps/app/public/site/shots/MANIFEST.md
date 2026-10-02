# Product shots

Example data only. Every image shows the app's built-in sample data from `apps/api/src/demo/demo-data.ts`, loaded with `bun scripts/demo-data.ts --locale <en|de>`: invented companies and people on `.example` domains. The English set uses the international roster (UK, US, Netherlands, Ireland, the Nordics and more, deals in GBP, USD, CHF and EUR), the German set the German roster (deals in EUR). The signed-in user and the workspace were invented for the capture and are not in the seed: Emma Carter at Harbourline Supply for English, Lena Hoffmann at Nordlicht Handel for German. Reporting currency EUR in both.

Captured on 2026-10-02 from a separate, disposable local database (`crm_preview`), never a real workspace. The sample data is dated relative to the day it is loaded, so "won this month" and "won back this month" hold only when the data is loaded and captured on the same day, after the first of the month. The sample data banner and the Next.js dev indicator are hidden.

The root folder holds the English set, `de/` the German set. `Shot` picks `de/` for a German reader and the root for every other language. Each file is a WebP (`cwebp -q 82`) of a 2x capture, scaled to the size in the table. A padded crop sits on the page background colour. `next/image` serves the 1x and 2x widths from it.

| File | Shows | Theme | Size (px) | Source | Example data only |
| --- | --- | --- | --- | --- | --- |
| hero-overview-light.webp | Whole app: sidebar plus overview with KPIs, chart, pipeline by stage and won back this month | light | 1600x1000 | viewport 1440x893 at 2x | yes |
| hero-overview-dark.webp | Whole app: sidebar plus overview with KPIs, chart, pipeline by stage and won back this month | dark | 1600x1000 | viewport 1440x893 at 2x | yes |
| win-back-light.webp | Win back list with the first company opened to its three people | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| win-back-dark.webp | Win back list with the first company opened to its three people | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| contact-activity-light.webp | Contact sheet of the won-back hotel buyer over Win back, Activity tab | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| contact-activity-dark.webp | Contact sheet of the won-back hotel buyer over Win back, Activity tab | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| follow-up-draft-light.webp | Contact sheet over Win back, Agent tab with the stored follow-up draft | light | 1600x1000 | viewport 1600x1000 at 2x | yes |
| follow-up-draft-dark.webp | Contact sheet over Win back, Agent tab with the stored follow-up draft | dark | 1600x1000 | viewport 1600x1000 at 2x | yes |
| contacts-light.webp | Contacts list | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| contacts-dark.webp | Contacts list | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| companies-light.webp | Companies list | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| companies-dark.webp | Companies list | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| follow-up-dialog-light.webp | The follow-up draft card on its own | light | 1376x1348 | crop of the draft card, padded | yes |
| follow-up-dialog-dark.webp | The follow-up draft card on its own | dark | 1376x1348 | crop of the draft card, padded | yes |
| contact-record-light.webp | Contact record sheet panel: header, fields, Activity tab | light | 1600x1206 | crop of the sheet at 1440x844 | yes |
| contact-record-dark.webp | Contact record sheet panel: header, fields, Activity tab | dark | 1600x1206 | crop of the sheet at 1440x844 | yes |
| overview-kpis-light.webp | Overview KPI cards row | light | 1600x325 | crop of the KPI group, padded | yes |
| overview-kpis-dark.webp | Overview KPI cards row | dark | 1600x325 | crop of the KPI group, padded | yes |
| overview-chart-light.webp | Overview closed won vs. new pipeline chart card | light | 1376x608 | crop of the chart block, padded | yes |
| overview-chart-dark.webp | Overview closed won vs. new pipeline chart card | dark | 1376x608 | crop of the chart block, padded | yes |
| overview-deals-light.webp | Overview deals in progress card | light | 1600x705 | crop of the deals block, padded | yes |
| overview-deals-dark.webp | Overview deals in progress card | dark | 1600x705 | crop of the deals block, padded | yes |
| win-back-table-light.webp | Win back table, header plus the first five companies | light | 1600x542 | crop of the table, padded | yes |
| win-back-table-dark.webp | Win back table, header plus the first five companies | dark | 1600x542 | crop of the table, padded | yes |
| deals-pipeline-light.webp | Deals pipeline, first three stage columns | light | 1600x890 | crop of three columns, padded | yes |
| deals-pipeline-dark.webp | Deals pipeline, first three stage columns | dark | 1600x890 | crop of three columns, padded | yes |
| win-back-compact-light.webp | Compact Win back view at tablet width | light | 1600x1138 | viewport 900x640 at 2x | yes |
| win-back-compact-dark.webp | Compact Win back view at tablet width | dark | 1600x1138 | viewport 900x640 at 2x | yes |
| de/hero-overview-light.webp | Whole app: sidebar plus overview with KPIs, chart, pipeline by stage and won back this month | light | 1600x1000 | viewport 1440x893 at 2x | yes |
| de/hero-overview-dark.webp | Whole app: sidebar plus overview with KPIs, chart, pipeline by stage and won back this month | dark | 1600x1000 | viewport 1440x893 at 2x | yes |
| de/win-back-light.webp | Win back list with the first company opened to its three people | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/win-back-dark.webp | Win back list with the first company opened to its three people | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/contact-activity-light.webp | Contact sheet of the won-back hotel buyer over Win back, Activity tab | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/contact-activity-dark.webp | Contact sheet of the won-back hotel buyer over Win back, Activity tab | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/follow-up-draft-light.webp | Contact sheet over Win back, Agent tab with the stored follow-up draft | light | 1600x1000 | viewport 1600x1000 at 2x | yes |
| de/follow-up-draft-dark.webp | Contact sheet over Win back, Agent tab with the stored follow-up draft | dark | 1600x1000 | viewport 1600x1000 at 2x | yes |
| de/contacts-light.webp | Contacts list | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/contacts-dark.webp | Contacts list | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/companies-light.webp | Companies list | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/companies-dark.webp | Companies list | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/follow-up-dialog-light.webp | The follow-up draft card on its own | light | 1376x1348 | crop of the draft card, padded | yes |
| de/follow-up-dialog-dark.webp | The follow-up draft card on its own | dark | 1376x1348 | crop of the draft card, padded | yes |
| de/contact-record-light.webp | Contact record sheet panel: header, fields, Activity tab | light | 1600x1206 | crop of the sheet at 1440x844 | yes |
| de/contact-record-dark.webp | Contact record sheet panel: header, fields, Activity tab | dark | 1600x1206 | crop of the sheet at 1440x844 | yes |
| de/overview-kpis-light.webp | Overview KPI cards row | light | 1600x325 | crop of the KPI group, padded | yes |
| de/overview-kpis-dark.webp | Overview KPI cards row | dark | 1600x325 | crop of the KPI group, padded | yes |
| de/overview-chart-light.webp | Overview closed won vs. new pipeline chart card | light | 1376x608 | crop of the chart block, padded | yes |
| de/overview-chart-dark.webp | Overview closed won vs. new pipeline chart card | dark | 1376x608 | crop of the chart block, padded | yes |
| de/overview-deals-light.webp | Overview deals in progress card | light | 1600x705 | crop of the deals block, padded | yes |
| de/overview-deals-dark.webp | Overview deals in progress card | dark | 1600x705 | crop of the deals block, padded | yes |
| de/win-back-table-light.webp | Win back table, header plus the first five companies | light | 1600x542 | crop of the table, padded | yes |
| de/win-back-table-dark.webp | Win back table, header plus the first five companies | dark | 1600x542 | crop of the table, padded | yes |
| de/deals-pipeline-light.webp | Deals pipeline, first three stage columns | light | 1600x890 | crop of three columns, padded | yes |
| de/deals-pipeline-dark.webp | Deals pipeline, first three stage columns | dark | 1600x890 | crop of three columns, padded | yes |
| de/win-back-compact-light.webp | Compact Win back view at tablet width | light | 1600x1138 | viewport 900x640 at 2x | yes |
| de/win-back-compact-dark.webp | Compact Win back view at tablet width | dark | 1600x1138 | viewport 900x640 at 2x | yes |

A capture from a real workspace is never committed here. See `docs/design.md`, Public site.
