# Product shots

Example data only. Every image shows the app's built-in sample data from `apps/api/src/demo/demo-data.ts`, loaded with `bun scripts/demo-data.ts --locale <en|de>`: invented companies and people on `.example` domains. The English set uses the international roster (UK, US, Netherlands, Ireland, the Nordics and more, deals in GBP, USD, CHF and EUR), the German set the German roster (deals in EUR). The signed-in user and the workspace were invented for the capture and are not in the seed: Emma Carter at Harbourline Supply for English, Lena Hoffmann at Nordlicht Handel for German. Reporting currency EUR in both.

Captured on 2026-11-12 from separate, disposable local databases (`crm_shots2_en_test` for English, `crm_shots2_de_test` for German), never a real workspace. The sample data is dated relative to the day it is loaded, so "won this month" and "won back this month" hold only when the data is loaded and captured on the same day, after the first of the month. The sample data banner and the Next.js dev indicator are hidden. Every Win back shot uses the "quiet for 30 days" filter: every company in the seed is quiet for two months or more, except the one customer won back this month. The Win back person page (`win-back-person`, `win-back-story`, `win-back-mails`, `follow-up-draft`, `follow-up-dialog`, `follow-up-sent`) shows the story the seed writes for each win back person (`apps/api/src/demo/demo-story.ts`), built only from the seeded mail, never from a model. Every shot was captured with the sample data loaded that same day, so all of them show the same dates and the same "quiet for" count. `follow-up-sent` shows the card after Send in a browser that opened no mail program.

The root folder holds the English set, `de/` the German set. `Shot` picks `de/` for a German reader and the root for every other language. Each file is a WebP (`cwebp -q 82 -m 6 -sns 100`) of a 2x capture, scaled to the size in the table. A padded crop sits on the page background colour. `next/image` serves the 1x and 2x widths from it.

| File | Shows | Theme | Size (px) | Source | Example data only |
| --- | --- | --- | --- | --- | --- |
| hero-overview-light.webp | Whole app: sidebar plus overview with KPIs, chart, pipeline by stage and won back this month | light | 1600x1000 | viewport 1456x910 at 2x (de: 1520x950) | yes |
| hero-overview-dark.webp | Whole app: sidebar plus overview with KPIs, chart, pipeline by stage and won back this month | dark | 1600x1000 | viewport 1456x910 at 2x (de: 1520x950) | yes |
| win-back-light.webp | Win back list, filter "quiet for 30 days", first company opened to its three people | light | 1600x1000 | viewport 1440x900 at 2x (de: 1600x1000) | yes |
| win-back-dark.webp | Win back list, filter "quiet for 30 days", first company opened to its three people | dark | 1600x1000 | viewport 1440x900 at 2x (de: 1600x1000) | yes |
| contact-activity-light.webp | Contact sheet of a hotel buyer over the Contacts list, Activity tab | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| contact-activity-dark.webp | Contact sheet of a hotel buyer over the Contacts list, Activity tab | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| follow-up-draft-light.webp | Win back person page: the story and the ready follow-up opened in the right column | light | 1600x1000 | viewport 1584x990 at 2x | yes |
| follow-up-draft-dark.webp | Win back person page: the story and the ready follow-up opened in the right column | dark | 1600x1000 | viewport 1584x990 at 2x | yes |
| contacts-light.webp | Contacts list | light | 1600x1000 | viewport 1472x920 at 2x | yes |
| contacts-dark.webp | Contacts list | dark | 1600x1000 | viewport 1472x920 at 2x | yes |
| companies-light.webp | Companies list | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| companies-dark.webp | Companies list | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| follow-up-dialog-light.webp | The next step card with the ready follow-up, on its own | light | 1376x1348 | crop of the next step card at 1584x990, padded | yes |
| follow-up-dialog-dark.webp | The next step card with the ready follow-up, on its own | dark | 1376x1348 | crop of the next step card at 1584x990, padded | yes |
| contact-record-light.webp | Contact record sheet panel: header, fields, Activity tab | light | 1600x1206 | crop of the sheet at 1440x844 | yes |
| contact-record-dark.webp | Contact record sheet panel: header, fields, Activity tab | dark | 1600x1206 | crop of the sheet at 1440x844 | yes |
| overview-kpis-light.webp | Overview KPI cards row | light | 1600x325 | crop of the KPI group at 1456x1400 (de: 1600x1400), padded | yes |
| overview-kpis-dark.webp | Overview KPI cards row | dark | 1600x325 | crop of the KPI group at 1456x1400 (de: 1600x1400), padded | yes |
| overview-chart-light.webp | Overview closed won vs. new pipeline chart card | light | 1376x608 | crop of the chart block at 1456x1400 (de: 1600x1400), padded | yes |
| overview-chart-dark.webp | Overview closed won vs. new pipeline chart card | dark | 1376x608 | crop of the chart block at 1456x1400 (de: 1600x1400), padded | yes |
| overview-deals-light.webp | Overview deals in progress card | light | 1600x705 | crop of the deals block at 1456x1400 (de: 1600x1400), padded | yes |
| overview-deals-dark.webp | Overview deals in progress card | dark | 1600x705 | crop of the deals block at 1456x1400 (de: 1600x1400), padded | yes |
| win-back-table-light.webp | Win back table, header plus the first company opened to its people | light | 1600x542 | crop of the table at 1440x900, padded | yes |
| win-back-table-dark.webp | Win back table, header plus the first company opened to its people | dark | 1600x542 | crop of the table at 1440x900, padded | yes |
| deals-pipeline-light.webp | Deals pipeline, first three stage columns | light | 1600x890 | crop of three columns at 1440x900, padded | yes |
| deals-pipeline-dark.webp | Deals pipeline, first three stage columns | dark | 1600x890 | crop of three columns at 1440x900, padded | yes |
| win-back-compact-light.webp | Win back table at desktop width, first company opened | light | 1600x1138 | viewport 1406x1000 at 2x (de: 1600x1138) | yes |
| win-back-compact-dark.webp | Win back table at desktop width, first company opened | dark | 1600x1138 | viewport 1406x1000 at 2x (de: 1600x1138) | yes |
| win-back-person-light.webp | Win back person page: story tab with the gist, your time together and chapters 01 and 02, next step card not opened yet | light | 1600x1000 | viewport 1584x990 at 2x | yes |
| win-back-person-dark.webp | Win back person page: story tab with the gist, your time together and chapters 01 and 02, next step card not opened yet | dark | 1600x1000 | viewport 1584x990 at 2x | yes |
| win-back-story-light.webp | Win back person page: the story column from the steps to the end of chapter 02 with the quote | light | 1086x1200 | crop of the story column at 1600x1400, padded | yes |
| win-back-story-dark.webp | Win back person page: the story column from the steps to the end of chapter 02 with the quote | dark | 1086x1200 | crop of the story column at 1600x1400, padded | yes |
| win-back-mails-light.webp | Win back person page: the emails tab, the unanswered request with the marked passage on top | light | 1600x1000 | viewport 1600x1000 at 2x | yes |
| win-back-mails-dark.webp | Win back person page: the emails tab, the unanswered request with the marked passage on top | dark | 1600x1000 | viewport 1600x1000 at 2x | yes |
| follow-up-sent-light.webp | Win back person page after Send: the next step card says the message is in the mail program | light | 1600x1000 | viewport 1584x990 at 2x | yes |
| follow-up-sent-dark.webp | Win back person page after Send: the next step card says the message is in the mail program | dark | 1600x1000 | viewport 1584x990 at 2x | yes |
| de/hero-overview-light.webp | Whole app: sidebar plus overview with KPIs, chart, pipeline by stage and won back this month | light | 1600x1000 | viewport 1456x910 at 2x (de: 1520x950) | yes |
| de/hero-overview-dark.webp | Whole app: sidebar plus overview with KPIs, chart, pipeline by stage and won back this month | dark | 1600x1000 | viewport 1456x910 at 2x (de: 1520x950) | yes |
| de/win-back-light.webp | Win back list, filter "quiet for 30 days", first company opened to its three people | light | 1600x1000 | viewport 1440x900 at 2x (de: 1600x1000) | yes |
| de/win-back-dark.webp | Win back list, filter "quiet for 30 days", first company opened to its three people | dark | 1600x1000 | viewport 1440x900 at 2x (de: 1600x1000) | yes |
| de/contact-activity-light.webp | Contact sheet of a hotel buyer over the Contacts list, Activity tab | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/contact-activity-dark.webp | Contact sheet of a hotel buyer over the Contacts list, Activity tab | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/follow-up-draft-light.webp | Win back person page: the story and the ready follow-up opened in the right column | light | 1600x1000 | viewport 1584x990 at 2x | yes |
| de/follow-up-draft-dark.webp | Win back person page: the story and the ready follow-up opened in the right column | dark | 1600x1000 | viewport 1584x990 at 2x | yes |
| de/contacts-light.webp | Contacts list | light | 1600x1000 | viewport 1472x920 at 2x | yes |
| de/contacts-dark.webp | Contacts list | dark | 1600x1000 | viewport 1472x920 at 2x | yes |
| de/companies-light.webp | Companies list | light | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/companies-dark.webp | Companies list | dark | 1600x1000 | viewport 1440x900 at 2x | yes |
| de/follow-up-dialog-light.webp | The next step card with the ready follow-up, on its own | light | 1376x1348 | crop of the next step card at 1584x990, padded | yes |
| de/follow-up-dialog-dark.webp | The next step card with the ready follow-up, on its own | dark | 1376x1348 | crop of the next step card at 1584x990, padded | yes |
| de/contact-record-light.webp | Contact record sheet panel: header, fields, Activity tab | light | 1600x1206 | crop of the sheet at 1440x844 | yes |
| de/contact-record-dark.webp | Contact record sheet panel: header, fields, Activity tab | dark | 1600x1206 | crop of the sheet at 1440x844 | yes |
| de/overview-kpis-light.webp | Overview KPI cards row | light | 1600x325 | crop of the KPI group at 1456x1400 (de: 1600x1400), padded | yes |
| de/overview-kpis-dark.webp | Overview KPI cards row | dark | 1600x325 | crop of the KPI group at 1456x1400 (de: 1600x1400), padded | yes |
| de/overview-chart-light.webp | Overview closed won vs. new pipeline chart card | light | 1376x608 | crop of the chart block at 1456x1400 (de: 1600x1400), padded | yes |
| de/overview-chart-dark.webp | Overview closed won vs. new pipeline chart card | dark | 1376x608 | crop of the chart block at 1456x1400 (de: 1600x1400), padded | yes |
| de/overview-deals-light.webp | Overview deals in progress card | light | 1600x705 | crop of the deals block at 1456x1400 (de: 1600x1400), padded | yes |
| de/overview-deals-dark.webp | Overview deals in progress card | dark | 1600x705 | crop of the deals block at 1456x1400 (de: 1600x1400), padded | yes |
| de/win-back-table-light.webp | Win back table, header plus the first company opened to its people | light | 1600x542 | crop of the table at 1440x900, padded | yes |
| de/win-back-table-dark.webp | Win back table, header plus the first company opened to its people | dark | 1600x542 | crop of the table at 1440x900, padded | yes |
| de/deals-pipeline-light.webp | Deals pipeline, first three stage columns | light | 1600x890 | crop of three columns at 1440x900, padded | yes |
| de/deals-pipeline-dark.webp | Deals pipeline, first three stage columns | dark | 1600x890 | crop of three columns at 1440x900, padded | yes |
| de/win-back-compact-light.webp | Win back table at desktop width, first company opened | light | 1600x1138 | viewport 1406x1000 at 2x (de: 1600x1138) | yes |
| de/win-back-compact-dark.webp | Win back table at desktop width, first company opened | dark | 1600x1138 | viewport 1406x1000 at 2x (de: 1600x1138) | yes |
| de/win-back-person-light.webp | Win back person page: story tab with the gist, your time together and chapters 01 and 02, next step card not opened yet | light | 1600x1000 | viewport 1584x990 at 2x | yes |
| de/win-back-person-dark.webp | Win back person page: story tab with the gist, your time together and chapters 01 and 02, next step card not opened yet | dark | 1600x1000 | viewport 1584x990 at 2x | yes |
| de/win-back-story-light.webp | Win back person page: the story column from the steps to the end of chapter 02 with the quote | light | 1086x1200 | crop of the story column at 1600x1400, padded | yes |
| de/win-back-story-dark.webp | Win back person page: the story column from the steps to the end of chapter 02 with the quote | dark | 1086x1200 | crop of the story column at 1600x1400, padded | yes |
| de/win-back-mails-light.webp | Win back person page: the emails tab, the unanswered request with the marked passage on top | light | 1600x1000 | viewport 1600x1000 at 2x | yes |
| de/win-back-mails-dark.webp | Win back person page: the emails tab, the unanswered request with the marked passage on top | dark | 1600x1000 | viewport 1600x1000 at 2x | yes |
| de/follow-up-sent-light.webp | Win back person page after Send: the next step card says the message is in the mail program | light | 1600x1000 | viewport 1584x990 at 2x | yes |
| de/follow-up-sent-dark.webp | Win back person page after Send: the next step card says the message is in the mail program | dark | 1600x1000 | viewport 1584x990 at 2x | yes |

A capture from a real workspace is never committed here. See `docs/design.md`, Public site.
