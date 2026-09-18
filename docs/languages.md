# Languages

Reloop CRM speaks seven languages: English, German, Spanish, French, Portuguese
(Brazil), Turkish and Simplified Chinese. Every person picks one in
Settings > General. The choice is that person's, not the workspace's, so two people
in one CRM read two different languages.

English and German are written by people. The other five are machine translated.
Every screen says so under the language select and links to the repository, because
a better word from a native speaker is the point of shipping them.

## How a language works

English is the key. A text in the code reads `t("Add a contact")`, and `t()` looks
that English sentence up in the dictionary of the chosen language. A key that the
dictionary does not hold falls back to English on its own. Nothing throws, nothing
shows an empty box, and one missing key never blocks a release.

A dictionary is a folder of JSON files under `apps/app/lib/i18n`, one folder per
language, named after the locale:

```
apps/app/lib/i18n/de/          German
apps/app/lib/i18n/es/          Spanish
apps/app/lib/i18n/fr/          French
apps/app/lib/i18n/pt-BR/       Portuguese (Brazil)
apps/app/lib/i18n/tr/          Turkish
apps/app/lib/i18n/zh-Hans/     Simplified Chinese
```

English has no folder. The key is the English text.

Each folder holds the same thirteen files. The split is only there to keep a file
small enough to read:

| File | What it holds |
| --- | --- |
| `agent-builder.json` | The agent builder |
| `copy.json` | Buttons, dialogs and toasts that every screen uses |
| `crm-records.json` | Companies, contacts and deals |
| `landing.json` | The public site |
| `navigation.json` | The sidebar and the command menu |
| `quotes.json` | Quotes in the mail |
| `records.json` | The record sheet |
| `server-copy.json` | Text a server page renders |
| `settings.json` | Settings |
| `settings-more.json` | Connections, agents, fields, tracking |
| `status.json` | Status and health |
| `ui.json` | The shared components in `packages/ui` |
| `win-back.json` | Win back |

A file is a flat object. The key is the English text, the value is your language:

```json
{
	"Add a contact": "Kontakt hinzufügen",
	"{count} of {total} rows": "{count} von {total} Zeilen"
}
```

## Add a language

You need no TypeScript for the translation itself. Two small files register the
folder, and the rest is text.

1. **Copy a folder.** `cp -r apps/app/lib/i18n/de apps/app/lib/i18n/it` for Italian.
   Use the locale code you want the cookie and the CSV export to carry.
2. **Translate the values.** Leave every key exactly as it is. The key is the
   lookup, so one changed character makes the line fall back to English.
3. **Register the code.** Add your locale to `LOCALES` in
   `packages/db/src/locale.ts`, then add its native name to `LOCALE.names`, its
   BCP 47 tag to `LOCALE.tags` and the locale to either `writtenByPeople` or
   `machineTranslated`.
4. **Register the files.** In `apps/app/lib/i18n/dictionaries.ts` add the thirteen
   imports, one block in `DICTIONARY_MODULES` and one line in `DICTIONARIES`. Copy
   the block above yours and change the locale code. Both maps are checked against
   `Locale`, so `bun run check-types` fails until both hold your locale. You cannot
   forget one.
5. **Run the checks.** `bun test` in `apps/app` parses every file, compares every
   key against English and compares the placeholders. `bunx biome check apps
   packages --write` formats the JSON.

## Rules for a value

- **Keep every placeholder.** `{name}`, `{count}` and `{version}` are replaced at
  runtime. Your sentence needs the same set the English key has, spelled the same
  way. Move them where your grammar wants them.
- **Keep the proper nouns.** Reloop, Slack, Gmail, IMAP, CSV, OpenRouter and every
  model name stay as they are.
- **Write no dash.** An em dash, an en dash and a horizontal bar are refused by the
  test suite. Use a full stop or a comma.
- **Use the informal register**, the way German uses "du". This is software for a
  sales team, not a bank letter.
- **Leave no value empty.** Delete the key instead: a missing key falls back to
  English, an empty value shows nothing.
- **Ship all thirteen files**, even when you translate only some of them. An empty
  file holds `{}` and is valid.

## What the checks do

`apps/app/test/dictionaries.spec.ts` runs on every build.

- **German fails the build when a key is missing.** German is written by people and
  is complete, so a new `t()` call without a German line is a mistake.
- **A machine translated language fails the build only on a structural fault**:
  a file that does not parse, a key English does not have, a placeholder that does
  not match, a dash, or an empty value. A missing key is allowed and the test
  prints the coverage of each language.

That split is on purpose. A structural fault is a bug, and anybody fixes it in a
minute. A missing key is a gap in a translation that already falls back to English,
and one unfinished language must never hold up a release.

## What stays English

- **The CSV export.** `apps/api/src/exports/exports-copy.ts` translates the column
  headers, the file name and the stored enum words into German only. A session in
  another language downloads an English file. The file is never half English and
  half something else.
- **Two labels in `packages/ui`**: the `Loading` label of the dot matrix and the
  `Thinking` label of the thinking indicator. Neither file carries a `"use client"`
  directive, so neither one reaches the translator.
- **The month names on the dashboard chart.** The API builds them with a fixed
  `en-US` formatter in `apps/api/src/dashboard/dashboard.service.ts`.
- **What the agent writes.** The agent writes English, or German with
  `RELOOP_GERMAN`. See `docs/environment.md`.
