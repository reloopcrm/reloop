# Connections — rules for AI agents

Covers `/settings/connections` and everything under it: the index, per-connection
pages, the intake page (it explains the REST API), the add-connection picker, and identity matching.

Read `docs/design.md` first. Read `docs/api.md` before touching `apps/api`, and
`docs/agent.md` before touching `apps/agent`. The Paper file is
`app.paper.design/file/01KZ72S23CM00WXN6S1MP68M03/1-0`, page **crm - grim**.

## The one rule that governs everything here

**A connection is a capability. An automation is an agent.**

A connection page shows what a connection can do, who it is wired to, and which
agents use it. It never owns, authors, or edits an automation. Automations are
built in the agent builder chat by tagging the integration, and they live at
`/agents/:agentId`.

This is already true in code: `builderResource.kind` in
`apps/api/src/conversations/conversations.contracts.ts` is
`["integration", "company", "contact", "deal"]`, and the composer picker in
`apps/app/components/agent-builder/agent-composer.tsx` is labelled "Tag CRM
records and integrations" with ids shaped `google:calendar`, `google:gmail`.
A new integration becomes taggable by extending that enum's id space, not by
building a second authoring surface.

If you find yourself adding a toggle, a trigger builder, or an "Edit automation"
form to a settings page, stop — that work belongs in the builder.

## Removing a connection is an owner or admin decision

A connection is shared. One person disconnecting Slack stops every agent that
posts to it and clears the cached channel list for everybody, so
`SlackConnectionService.disconnect` asks `canManageConnections` (`@crm/auth`)
after `AgentAccessService.assertMember`, and `slack.status` returns `canManage`
so the button is disabled for the same people the service refuses. Being signed
in is not authorisation: `AuthMiddleware` only proves a session exists.

Everything additive — joining a channel, creating one, refreshing people — stays
open to any workspace member, because the agent builder needs it and Slack can
undo it.

## Connecting Slack is refused at the OAuth endpoints, not in the UI

Connecting is the same decision as disconnecting, because `replaceSlackConnection`
deletes every other Slack account row: a second person connecting *replaces* the
workspace's Slack, and every deployed agent then reads from and posts to whichever
Slack they installed. Hiding the button is not enough — `authClient.oauth2.link`
is one POST.

`slackConnectGuard` (`packages/auth/src/slack-connect.ts`) is Better Auth's
`hooks.before`, and it asks the same `canManageConnections` the API does. It
covers all three doors: `/oauth2/link`, `/sign-in/oauth2` (Slack is a connection,
never a sign-in method, and that endpoint needs no session) and
`/oauth2/callback/slack`. The callback is the one that matters — refusing there
happens **before the code is exchanged**, so a refused attempt writes no
`SlackWorkspaceGrant` user token and deletes no bot token. Google and Microsoft
sign in on different paths and never reach the guard.

A workspace with no owner and no admin lets any member connect. There is nobody
left to ask, and a fresh install must not be locked out of its first connection.

## A mailbox is read backwards as well as forwards

The reason a stranger installs this product is the mail they already have. So
every mailbox, Gmail and Outlook and IMAP alike, reads its own history from the
day it is connected, and keeps reading new mail at the same time.

- **The connect flow asks how far back, in the same four words everywhere**:
  everything in the mailbox, the last 12 months, the last 90 days, only new mail
  from now on.
  `apps/app/app/(app)/[slug]/settings/connections/import-history.tsx` owns the
  list, the label and the note, and the three connection cards import it.
  Everything in the mailbox is the default.
- **Sent mail is read first, then everything else.** The backfill runs in two
  phases (`phase` in `apps/api/src/mailbox/backfill-cursor.ts`): Gmail asks
  `in:sent`, Outlook asks the `sentitems` folder, then both read the whole
  mailbox. Newest first inside each phase. Without the sent phase an inbound
  reply arrives before the outbound message that started the thread, and
  `ThreadWriterService.store` drops it, because nothing yet says the rep ever
  answered that person. That is exactly the win back case, so the order is not a
  preference.
- **The answer is stored before the OAuth redirect**, through
  `google.setImportSince` / `microsoft.setImportSince`, which creates the
  `MailboxSync` row if there is none. A row without a grant is skipped by the
  sync tick, so it costs nothing.
- **The card says what is happening while it happens.** The status reads
  `Reading mail` and the line under it reads `Reading the history, back to
  <date>`, with a percentage and a bar when the backfill has a floor. The
  percentage is a share of time, `(before - reached) / (before - floor)`, never
  a count: the API cannot count a mailbox it has not read. Everything in the
  mailbox has no floor, so it gets the sentence and no bar.
  `apps/app/lib/import-progress.ts` is the one place that computes it, the
  connections index and both mailbox cards render it through `ImportProgress`,
  and a finished backfill says so for seven days. `backfillProgress` in the API
  carries `state` so the card can tell done from never started.
- **Changing the answer replans the backfill**, because the floor moved.
  Everything already filed stays.
- **Deleting synced data ends the backfill.** Google and Outlook promise that
  nothing deleted comes back, so `purgeSyncedData` marks the backfill done
  (`SyncStateService.stopBackfill`). IMAP promises the opposite and is
  unchanged.

## A webhook is the connection with no vendor

Settings → Connections → Webhooks sends the six events in `@crm/db/crm-events`
to an address the operator runs. It brings in nothing, which is the whole
guarantee: nothing here reads another tool and nothing here writes to the CRM.
It is the answer to "can you integrate with X" when X is not worth a module.

- **The event path is the one that already exists.** The API writes the durable
  `agent-event` task, and the agent worker fans it out. `queueWebhookDeliveries`
  (`apps/agent/agent/lib/webhooks.ts`) writes one `webhook-delivery` task per
  matching enabled webhook, keyed `webhook:<taskId>:<webhookId>` so a re-read of
  the event queues nothing twice. There is no second delivery path and no
  outbound call in Nest.
- **Delivery has its own lane.** `runWebhookLane` runs beside the visible,
  insight and research lanes, and `webhook-delivery` is filtered out of
  `VISIBLE_KINDS`. A receiver that never answers therefore delays no agent work,
  and the event task is already finished before the first POST goes out.
- **Three attempts, then it stops.** A failed attempt leaves the task open, the
  lease expires, and the next tick claims it again. `claimDue` refuses a fourth
  attempt because of `MAX_ATTEMPTS`, and the third failure completes the task
  with what the receiver said. The card reads the last status, never a log.
- **Ten seconds per call**, `WEBHOOKS.deliver.timeoutMs` in
  `packages/db/src/webhooks.ts`, which holds every webhook constant.
- **The body is signed, not authenticated.** `x-reloop-signature` is
  `v1=HMAC-SHA256(timestamp + "." + body)` with the webhook's own secret, and
  `x-reloop-timestamp` is what the receiver signs with. The secret is sealed with
  `sealWebhookSecret` the same way the IMAP password is, and the page shows a
  masked hint, never the value.
- **Only an owner or an admin writes a webhook, or reads its address.**
  `canManageConnections`, the same predicate Slack uses, in the service and on
  the button. `webhooks.status` returns `url` and `secretHint` as null to a
  member, because a receiver address is itself a bearer credential: anybody who
  holds it can post forged events at that receiver. A member still sees the
  events and the liveness, so failure stays on the surface.
- **A private address is opt-in per webhook.** The default refuses anything that
  does not resolve to a public address, because the CRM would otherwise post to
  whatever the operator's network runs. `allowPrivateHost` lifts that for one
  webhook, and the switch states the risk where it is turned on. Link-local,
  unspecified and multicast addresses stay refused whatever the switch says, so
  the cloud metadata service is never reachable. The answer's body is never read
  back into the CRM: the card keeps the delivery time and the status code the
  receiver returned, and nothing else from it.

## Google, Microsoft and Slack are connected with values a person types

A client id and a client secret used to live only in `.env`, so a self-hoster had to
open a shell to change one. They are now typed on Settings, Connections, on a hosted
install and on a self-hosted one. `oauthApp.*` in `apps/api/src/oauth-apps` is the
whole surface, and `packages/db/src/oauth-apps.ts` holds every constant, column name
and environment variable name for the three providers.

- **The saved value wins over the environment variable.** A person just typed it, so
  it is the newer answer. An install that keeps `GOOGLE_CLIENT_ID` in `.env` and saves
  nothing is unchanged. `status` reports `source` as `database`, `environment` or
  `none`, and `environmentAlso` says the `.env` line is shadowed.
- **Only the secret is sealed.** `sealOAuthAppSecret` with the purpose
  `oauth-app-secret`, the same way the webhook secret and the TypeSafe key are. The
  client id and the tenant id are stored in the clear, because a browser sees them in
  the OAuth URL anyway. The secret is never returned: `secretHint` is a mask.
- **`packages/auth/src/env.ts` reads the saved value first.** `rememberStoredEnv`
  fills a map before the `auth` instance is built, and `env.google`, `env.microsoft`
  and `env.slack` resolve on first read, not at module load.
- **The API restarts itself after a save or a clear.** The `auth` instance is built
  once at module load, and rebuilding it would touch every importer of `@crm/auth`.
  `save` and `remove` answer first, then send the process `SIGTERM` after
  `OAUTH_APPS.restart.delayMs`. `restart: unless-stopped` and the dev watcher bring it
  straight back, so the outage is a few seconds. On Vercel there is nothing to restart,
  so the answer is `unavailable` and the person restarts the deployment.
- **`apps/api/src/main.ts` reads the credentials before it imports anything else.**
  `create-app` is a dynamic import and the API build runs with `--splitting`, so
  `@crm/auth` is in a chunk and evaluates after the read. `test/boot-order.spec.ts`
  pins that. Without it the saved values are read too late and ignored.
- **Nothing here throws.** An unreachable database, a missing column or a secret that
  cannot be opened logs one warning, and the environment decides. A self-hoster who
  saved nothing sees no change at all.
- **Only an owner or an admin writes a pair, or reads the hint**, the same
  `canManageConnections` Slack, webhooks and TypeSafe use.
- **The redirect URI comes from the API**, never from the browser.
  `oauthRedirectUri(provider)` builds it from `API_URL`, and `auth.ts` uses the same
  function for Slack, so the page and the OAuth call cannot disagree.

## TypeSafe lives in Settings, AI

TypeSafe is not a connection any more. It is a card on Settings, AI, beside the model
and the cost table, because it is a lever on what the agent costs.
`/settings/connections/typesafe` redirects to `/settings/ai`.

It holds one API key for the workspace. It buys a cheap first read of every mail
conversation, so the expensive model only reads the ones that look like business.
`docs/agent.md` holds the gate; this section holds the key.

- **Off by default, and opt-in by key.** No key means no call and no change at all. A
  self-hoster who has never heard of TypeSafe sees the same behaviour as before.
- **`TYPESAFE_API_KEY` is the same key for an install that keeps secrets out of the
  database.** A key saved here wins over it.
- **Sealed like the webhook secret**, with `sealTypesafeKey` and `appSecretKey`. The
  card shows a masked hint and never the value.
- **Only an owner or an admin writes it, or reads the hint**, the same
  `canManageConnections` Slack and webhooks use.
- **It sends, so the card says what it sends**: the business description from Settings
  and one mail conversation per read.

## Direction is the organising idea

Every connection declares what it **brings in** and what it **sends**. Use those
two words. Not arrows, not "inbound/outbound", not scope tokens.

`Sends` earns its place by being reassuring when it is empty. HubSpot reads
"Nothing, so nothing here can change HubSpot" — that is the guarantee a migration
needs, stated where someone will look for it.

## Destinations: derived or chosen

When an agent sends something, its destination is one of two kinds. Getting this
distinction wrong is what makes an automation feel like it works by magic.

**Derived** — follows from the record, so never ask. The deal's owner. The
channel that belongs to this deal. Say so explicitly in the UI ("The person who
booked, at the email they booked with. Nothing to choose.") so the absence of a
control reads as deliberate.

**Chosen** — cannot be inferred, so must be asked exactly once. A standing
channel like `#sales`. A naming pattern for channels the agent creates
(`#deal-{company}`). A billing contact.

Chosen destinations are collected **in the builder conversation** with the
Questionnaire, not in a settings form. See "The Questionnaire" below.

## Slack needs two grants, not one

A bot token cannot add itself to a private channel. No Slack scope grants that.
The workspace must also hand over a **user token** (`xoxp-`), which the app then
uses to act as the person who connected Slack.

- **Public channel** — the bot self-joins with `conversations.join`. Bot token only.
- **Private channel** — only a user token can invite the bot. Both tokens.

The bot token lives on `Account`. The user token lives on `SlackWorkspaceGrant`,
keyed by Slack team id, because the grant belongs to the workspace and not to the
person who clicked Connect. `packages/auth/src/slack-grant.ts` writes it, and
`apps/agent/agent/lib/slack-connection.ts` is the only place that reads either.

A missing user grant is a capability that is off, not an error. The connection
page names it, and the private-channel row falls back to asking a human.

**The cached row does not choose the token.** `joinSlackChannel`
(`apps/agent/agent/lib/slack-membership.ts`) reads the channel from Slack with
`conversations.info` before it picks a path. `slackChannel.isPrivate` and
`isMember` are a cache, and a cache is wrong the moment somebody adds the bot in
Slack — or the moment a new column arrives with a default, which classifies every
existing row as public and non-member until the inventory next runs. A bot that
cannot see the channel at all is read as private and not a member, which is the
only safe reading. When Slack and the row disagree the row is corrected and a
`slack-people-match` task is queued, so the connection page stops showing the
stale classification too.

**Nothing else calls Slack to read the channel list.** The agent builder reads
the cached rows and, when they are older than `SLACK.inventory.staleMs`, queues
the same background task rather than waiting on a round trip
(`apps/agent/agent/lib/slack-people.ts`). A builder chat that blocks on Slack is
a builder chat that is as slow as Slack is.

## Permissions are shown in groups, not one line each

Sixteen scopes read as noise. Group them by what they touch — people, channels it
can read, messages it can send, channels it can change — and give each group a
count of how many reach the whole workspace. `SLACK_SCOPE_GROUPS` in
`packages/auth/src/slack-scopes.ts` owns both the grouping and the plain wording.

The catalogue is the single source. `auth.ts` builds its scope request from it and
the page renders from it, so the screen cannot promise something the app never
asked for.

## Identity matching is connection-level

"Message whoever owns the deal" needs a CRM user *and* a Slack member. Those are
two identities. Match on email, show the result, and let a human fix it.

An unmatched person must be allowed. The automation stops and says so rather than
guessing at a similar name — and the connection page surfaces the count so the
gap is visible before it bites.

## The Questionnaire

The strongest pattern in this work. When the builder cannot derive something, it
asks in chat rather than failing or guessing.

Reuse `packages/ui/src/components/questionnaire.tsx` — `Questionnaire`,
`QuestionnaireItem`, `QuestionnaireTitle`, `QuestionnaireDescription`,
`QuestionnaireChoices`, `QuestionnaireChoice`, `QuestionnaireActions`,
`QuestionnaireSubmit`. It is wired through `agent-clarification-composer.tsx` and
`builderQuestionResponseInput`.

Rules for a question:

- Ask only what cannot be derived. Say which parts you already worked out.
- Title is the question in plain words. Description says why it is being asked
  ("This one is a standing channel, so it is the same every time").
- Choices carry a fact that helps decide — member counts, last activity — not
  decoration.
- Always offer an escape ("Search for another channel").
- Footnote the constraint that shapes the list ("Only channels Slack has been
  added to").
- The submit label restates the answer: "Use #sales", not "Continue".

## Failure is on the surface

Nobody owns these automations day to day, and a broken one currently sits for a
week or two. So every connection surface leads with liveness, not configuration:
"Last call arrived 31 minutes ago", "1 call needs a look", "3 of 4 matched".

An automation you cannot see rot in is one nobody will own.

## Irreversible things are bounded in writing

Anything that messages a customer states its own limits next to the switch:
"It stops the moment Stripe reports the payment, and never messages the same deal
twice in a day." "It runs once per deal." An agent that DMs people about money
needs its guardrails legible to whoever turns it on.

## Layout

Page metrics are tokens. Never a literal.

| Token | Value | Use |
| --- | --- | --- |
| `--spacing-page-top` | 40px | Top bar to first line of content |
| `--spacing-page-bottom` | 40px | Below the last block |
| `--spacing-page-inline` | 24px | Viewport gutters |
| `--spacing-page-gap` | 24px | Between top-level blocks |
| `--spacing-block-inline` | 20px | Inset on every block, **including the page title** |
| `--container-page` | 820px | Content column |
| `--container-page-wide` | 1120px | Two-column or table pages |
| `--container-narrow` | 560px | Empty states, dialogs |
| `--container-sheet` | 640px | Edit sheet over a page |

`--spacing-block-inline` is the one doing real work: a card sits flush at the
column edge and carries 20px of its own padding, so card text lands in the same
lane as the title on a flat page. The two page types stay aligned without
matching each other's chrome.

Short single-decision pages (empty state, pre-connect, match people) centre
vertically. List pages top-align so nothing jumps when a row is added.

## Cards versus flat

Cards are for **discrete, independently-actionable objects** — an agent you can
pause on its own, a connection row with its own Manage button, a choice in a
picker, a Questionnaire.

Flat sections separated by a 1px `--color-dark-border` rule are for **a page
describing one thing** — the intake page, the pre-connect page.

The split is by what the block *is*, not by page. Do not card a section; do not
flatten a list of separately-actionable objects.

## Brand marks

`packages/ui/src/components/brand-logos/` has claude, eve, github, google,
microsoft, nextjs, slack, stripe, vercel. **Stripe is there** — use it.

Missing from the repo and living only in Paper: **hubspot** (`hubspot icon`
`L5E-0`), **docusign** (`docusign logo` `L5Z-0`), **ergo** (`ergo logo` `KJJ-0`).
Extract their path data into `brand-logos/*.tsx` shaped like `stripe.tsx` when
building these screens.

Until a mark exists, `EntityLogo` falls back to an initials monogram on
`bg-muted` — that is correct behaviour, not a placeholder to design around. Only
icon marks are used at these sizes; the wordmarks stay unused.

Docusign is spelled with a lowercase s since its 2024 rebrand. The note-taker is
**Ergo**.
