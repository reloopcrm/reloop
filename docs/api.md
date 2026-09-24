# API Rules

## Logging

`apps/api/src/logging`. `new Logger(Thing.name)` picks up `ContextLogger`. **Never
`console.log`.** Format follows `NODE_ENV` and is not configurable.

- **One object, not extra arguments** — `logger.log({ message: "Saved", userId })`;
  Nest prints a line per argument.
- **Errors pass the stack second** — `logger.error({ message }, err.stack)`. Passing
  the error object drops the trace.
- **Never log headers, query strings, or bodies** — cookies and personal data.
- **`LoggingModule` stays first in `AppModule`'s imports**, and Better Auth routes log
  via its own `middleware` option — it mounts before `MiddlewareConsumer`, so
  `/api/auth/*` never reaches ours.
- `requestId` from `RequestLoggerMiddleware` via `AsyncLocalStorage`;
  `UserContextInterceptor` adds `userId`. Prisma statements are opt-in
  (`PRISMA_LOG_QUERIES`).

## Intelligence never lives in the API

The API serves HTTP, auth, tRPC and the mailbox sync. It does **not** research, enrich,
score, summarise, match identities or decide anything about a person or company — not
as a fallback, not behind a flag. That is the eve agent in `apps/agent`, which owns
the vendor clients, the confidence model and the writes.

Nest's half is to report *that something happened*: `AgentTriggerService` writes an
`AgentTask` row. A row, not an HTTP call — the agent already leases from that table,
so the row survives the agent being down.

About to add a vendor client to `apps/api`? You want `apps/agent/agent/lib`. One
documented exception, for timing: the exchange-rate fetcher, below.

## One organization, and it is not a tenancy boundary

Single tenant. No org header, no org interceptor, no org-scoped cache keys, **no
`organizationId` on any CRM record.**

Hosted mode does not change that: a customer gets a whole database, and `db` from
`@crm/db` resolves to that customer's client through an `AsyncLocalStorage`. The
tenant is resolved once per request in `apps/api/src/tenancy/tenant.middleware.ts`
and never travels as a parameter. A process-wide cache key that is per workspace
goes through `tenantScopedKey()` (`@crm/db/tenant-context`), and a cron route that
serves every workspace loops through `forEachTenant()` (`@crm/db/tenancy`). The loop
runs `TENANCY.loop.concurrency` tenants at once with `TENANCY.loop.budgetMs` each
(`packages/db/src/tenancy-config.ts`); a tenant past its budget is reported as
failed and the others carry on. Work that outlives its request, a detached
`void (async …)()`, wraps itself in `holdTenant()` so the pool never disconnects
the client under it. The exchange-rate loop fetches the feed once per base
currency (`RatesService.refreshAll`) and writes it to every tenant. The
variables and the rules are in `docs/environment.md`.

A **singleton workspace** exists — Better Auth's `organization` plugin, one row with
id `WORKSPACE_ID` (the literal `workspace`, in `@crm/db`, re-exported by `@crm/auth`
so the agent needn't depend on it). It answers only: what are we called, who works
here, what do we sell.

- **The id is a constant, never a parameter.** A function taking an `organizationId`
  has turned the plugin into tenancy plumbing.
- **Signing in is the join; no invite flow.** `ensureWorkspaceMembership` runs in
  `databaseHooks.session.create.before` and **degrades, never throws** — a throw fails
  the session create and locks everyone out. The plugin's `invitation` table is unused.
- **First account is owner**, and the hook enrols pre-existing users, oldest first.
- **Permissions come from `@crm/auth`** — `canRenameWorkspace`, `canChangeRole`,
  `canAssignRole`, `canConfigureSso`, `canManageCurrency`, `canManageFields` — enforced by the service
  *and* used to disable the UI control, so the button and the 403 cannot disagree.
  They live in `packages/auth/src/roles.ts`, which imports nothing, so a client
  component reaches them through `@crm/auth/roles` without pulling Prisma in.
  `WorkspaceService` adds two invariants: **the last owner cannot be demoted**, with
  `FOR UPDATE` on the owner rows before counting, and **only an owner grants or
  changes `owner`** (`canAssignRole`).
- **Reads and writes go through tRPC**, not `authClient.organization.*`. `accessGuard`
  refuses every mutating `/api/auth/organization/*` path (`isOrganizationWrite`), so
  the raw plugin endpoints cannot skip the last-owner count or overwrite the slug and
  `onboardedAt`. Add a new better-auth read to `ORGANIZATION_READ_PATHS` to open it.
- **Name and website are required at onboarding and cannot be skipped**, in the form
  *and* in `updateWorkspaceInput`, posting the same `workspace.update` as settings.
- **Onboarded state is `onboardedAt` inside the plugin's `metadata` blob**, not a
  column; `isOnboarded`/`markOnboarded` (`@crm/db/workspace`) are the only accessors,
  and `markOnboarded` preserves every other key.
- **The name starts as `DEFAULT_WORKSPACE_NAME` (`CRM`), a placeholder not an
  answer.** The header renders `<name> CRM`, so `workspaceLabel` tests the name rather
  than comparing to the default.
  A hosted sign-up already asked for the company, so `provisionTenant` writes that
  name and its slug into the new tenant's row, and `/onboarding` pre-fills both.
  Only `onboardedAt` settles the gate, so the website step still runs.
- **The website queues the agent's `workspace-profile` task** and goes through
  `normalizeDomain`, rejecting null. Stored canonical, so re-saving uncanonically
  counts as a change and re-queues research.

### Gates in `proxy.ts`

One gate: has the workspace been named. Asked server-side on every request.

- **`getSessionCookie()` decides signed-in**; pages still resolve the real session via
  `requireMailboxAccess()`.
- **Nothing is cached in a cookie** — the fact reverts on a database reset while a
  year-long marker insists the gate passed. Cache in the API if cost ever matters.
- **An unreachable API fails open** (`unknown` lets the request through).
- **`/sign-in`, `/grant-access`, `/eve` are ungated.** `/sign-in` is the only path a
  stranger may read; `/` joins it only when `IS_MARKETING` is set.
- **`/onboarding` itself goes home once the workspace is named; the steps under it do
  not.** `/onboarding/business` and `/onboarding/ai` render for a settled workspace,
  because nothing else marks them finished and a rep is walked through them in order.
  The last step lands on `/settings/connections`
  (`apps/app/test/onboarding-gate.spec.ts`).

### The name is also the URL

Served under the workspace slug (`/comp-ai/companies`). **Cosmetic, not tenancy** —
every query still resolves through `WORKSPACE_ID`.

- **The slug is the plugin's column**, written by `workspaceSlug(name)`
  (`@crm/db/workspace`) on rename and create. **Never derive it on read.**
- `ensureWorkspaceMembership` reconciles it; `RESERVED_SLUGS` prevents collision with
  a real route (a collision gets `-crm`).
- **The proxy is the only thing that puts the slug on.** Missing or stale slugs are
  redirected with the query string intact, not 404'd; `[slug]/layout.tsx` is the
  backstop.
- `appPath` in `proxy.ts` is the one place `/` resolves for a signed-in rep, which
  keeps every `callbackURL` correct without knowing about slugs.
- **Renaming moves the URL**, so `workspace-form.tsx` replaces the location onto the
  slug `workspace.update` returns.

## SSO is a row, not a deployment

An `ssoProvider` row via Better Auth's `sso` plugin, on Settings → SSO, because a
self-hoster's admin cannot redeploy.

- **OpenID Connect only** — issuer, client id, secret; endpoints from discovery. No
  SAML UI: it needs an X.509 cert and SP signing key we have nowhere to keep.
- `SsoService` passes `WORKSPACE_ID`, never an input.
- **Management is tRPC (`sso.*`); signing in is `authClient.signIn.sso()`.**
  `POST /api/auth/sso/register` only checks the admin role when the body carries an
  `organizationId`, so `accessGuard` refuses the call unless that id is `WORKSPACE_ID`.
  Without it a member registers a provider and captures their colleagues' domain.
- **`sso.signInOptions` is the one public procedure in the app.** Every other `sso.*`
  takes `AuthMiddleware` at the *method*, which is what leaves it open. A client
  secret is never read back out.
- **It is the API's answer, not the app's** — the API serves `/api/auth/*`.
- **An install with no Google, no Microsoft and no provider says so**, naming the
  variables; a read that *fails* falls back to offering Google.
- **A provider hides the social buttons, it does not disable them** —
  `/sign-in?method=google` and `?method=microsoft` still work, so a mistyped issuer
  cannot lock an admin out.
- **Signing in with an IdP does not cost you Gmail.** `needsMailboxGrant` (`@crm/auth`)
  walls only an account whose sign-in rows are *all* mailbox providers — Google,
  Microsoft, or both — and none of them granted. `mailboxGrantsNeeded` returns which,
  so `/grant-access` offers the button they can actually use.
- `ALLOWED_SIGN_IN` still decides who gets an account, in
  `databaseHooks.user.create.before`, for SSO sign-ups too.
  Session creation, existing auth sessions, app sessions, and tRPC calls also check the current list.
- **`isSignInAllowed` (`@crm/auth/sign-in-grants`) is that check, and it is async.** It is
  `ALLOWED_SIGN_IN` **or** an address an owner granted through Settings → Members, stored in
  `AppSetting.signInAddresses`. The environment variable is the floor; the app only adds. Every
  gate reads the one function: both `databaseHooks`, `accessGuard`, `AuthMiddleware`,
  `serveOpenApiDocument` and `apps/app/lib/session.ts`. `isWorkspaceEmail` stays the
  environment-only half, and `workspaceDomains()` still answers "is this address us" for the
  mailbox and the tracking filter. The database is read only when the environment already said no.
  See `SECURITY.md` for what the boundary holds.
- `organizationProvisioning: { disabled: true }` — `ensureWorkspaceMembership` already
  does the join.

## tRPC is the data surface; REST is auth and health only

- **One router per module**, `*.router.ts` (the codegen glob), with
  `@Router({ alias })` and `@UseMiddlewares(AuthMiddleware)`. **No `AuthMiddleware`
  means public — there is no other guard.**
- **A procedure that builds lasting access adds `SessionOnlyMiddleware`.** An API
  key is a session in a header, so a procedure that mints a credential, grants a
  role, registers a sign-in provider, stores an outbound address or deploys code
  must refuse one: revoking the key must undo everything the key did. The list is
  in `SECURITY.md`. A role gate on top of it is still the service's job.
- **Routers are thin**: zod in, service call out; Prisma lives in `*.service.ts`.
- Services throw Nest's `HttpException` family; `DomainErrorMiddleware` maps them.
- **Filter, sort and paginate in Prisma.** List procedures take `listInput` and return
  `{ rows, total, facetCounts }`. Never filter a whole table in the browser; never
  interpolate `sort` into a field name — use `resolveOrderBy`.
- **`src/generated/server.ts` is generated *and committed*, and `build` must never
  regenerate it** — the generator needs GLIBC 2.39, newer than Vercel's build image.
  Only `check-types` and `dev` run it. If the app cannot see a new procedure, it has
  not run.

### A file download is a controller, not a procedure

tRPC answers with JSON, so a CSV is a Nest controller:
`GET /api/exports/:entity` (`contacts`, `companies`, `deals`), in
`apps/api/src/exports`. Three rules make it work.

- **Same guard as the attachment controller**, which is to say no decorator at
  all. `AuthModule.forRoot`
  registers the Better Auth guard globally, and the route carries no
  `@AllowAnonymous`/`@OptionalAuth`, so it needs a session. The guard hands every
  request header to `auth.api.getSession`, and `enableSessionForAPIKeys` is on, so
  an `x-api-key` works too. A caller with neither gets 401 **before** the route
  says which lists exist.
- **The filter is the list's own filter.** `?filter=` carries the list input as
  JSON, parsed by `contactListInput` / `companyListInput` / `dealListInput` and
  handed to each service's `exportRows`, which calls the same private `buildWhere`
  the list calls. A filtered list exports filtered. There is no second filter.
- **`content-disposition` is what makes it stream.** The app's `/api/[...path]`
  proxy buffers a response unless it carries that header or an event-stream
  content type. Without it a 50,000 row file is held in the proxy's memory.

`exportRows` is an async generator that pages by `id` cursor
(`EXPORTS.page.size`, `exports/exports-config.ts`), so nothing builds the file in
memory. **The page order is `id` ascending, not the list's sort.** A cursor is
stable, and the sort is not worth an offset scan per page.

The file is UTF-8 with a byte order mark, `;` separated, CRLF, amounts with a
decimal comma: what German Excel opens without an import dialog. A value that
starts with `=`, `+`, `-`, `@` or a tab gets a leading `'` (`neutralizeFormula`),
so a contact called `=SUM(A1:A9)` stays text. Only values a person typed are
guarded; dates and amounts the exporter formats are not.

**A plain negative number keeps no guard.** `-1234,56` and `-1234` match
`^-\d+([.,]\d+)?$`, so Excel reads a number and nobody sees an apostrophe.
`-Rabatt` and `-5 Prozent` still get one. **A leading `+` always keeps its
guard**, phone numbers included: Excel evaluates `+4917012345678` as a formula and
prints `4,91701E+12`, which loses the country code without saying so. A visible
apostrophe is the smaller harm.

**The language comes from `?locale=`, not from the cookie.** `useLocale()` in the
browser already holds the chosen locale, so the client sends a finished value and
the API translates the fixed headers and the file stem through
`exports/exports-copy.ts`: `Vorname;Nachname;E-Mail` in `kontakte-2026-09-18.csv`.
The cookie is not read in the API because the API is also called with an API key,
where no cookie exists, and one source beats two. **`exports-copy.ts` holds all
seven languages.** The file stays in one language, it never mixes two. **Custom
field labels are never translated**, because the workspace wrote them, and neither
is a custom field's SELECT option. **A stored enum value is translated**: the four
enum columns, deal stage, status, potential and source, read their words from the
same map as the headers, so a cell says what the table says. A value added to one
of those enums fails `EXPORT_ENUM_WORDS` in the spec until somebody writes every
language. A caller with no `locale` gets English,
which is what `curl` with an API key gets.

**The file stem is ASCII in every language.** `Content-Disposition` carries the
name as bare bytes, so a browser reads a non-ASCII name as mojibake. German writes
`geschaefte`, Turkish writes `firsatlar`, and Simplified Chinese keeps the English
stem, because Han characters have no ASCII form. The columns inside the file carry
the full script.

**The date columns come from `?zone=`, an IANA name.** The browser sends
`Intl.DateTimeFormat().resolvedOptions().timeZone`, and the API writes `Created`,
`Last activity`, `Closed` and `Archived` in that zone, so the file and the screen
name the same day. A caller with no `zone` gets UTC, which is what `curl` with an
API key gets, and an unknown name is a 400. `Expected close` is a calendar date
already, so it is never shifted.

## The OpenAPI document is built at runtime, not committed

`GET /openapi.json` serves one document: Nest's own controllers plus a REST bridge
generated from every tRPC procedure. Swagger UI renders it at `/`.
`createApp` builds both halves and merges them, so nothing is generated at build
time and no file is checked in — the document is whatever the routers are.

**The bridge is mounted twice**, on `/rest` and on `/api/rest`, from `REST.bridge.mounts`
in `trpc/openapi.ts`. A Docker install publishes only the app, and the app forwards
`/api/*` to the API, so `/api/rest` is the one address a caller on the internet can
reach. `/rest` stays because a Vercel deployment uses it. Both mounts are the same
middleware, so neither opens anything the other does not.

**`GET /api/openapi.json` is the document a self-hoster reads**, and it is the tRPC
bridge half only, with `baseUrl` pointing at `/api/rest`. It answers 401 without a
session or an API key, in development and in production alike. It runs the same check
`AuthMiddleware` makes. It is built on the first request that passes that check and
cached, so a cold start never pays for it.

`SwaggerModule.setup` runs **before** `app.init()`, because it registers its Express
routes synchronously and Nest's own routing would otherwise shadow them. The factory
form defers building the document to the first request, which is what lets it read
the tRPC router that only exists after init.

**Swagger UI and `/openapi.json` do not exist when `NODE_ENV` is `production`.** The
document names every procedure and every input shape, which is a map for a stranger
who reaches the API directly. Both are a development tool, so `createApp` skips the
whole `SwaggerModule.setup` call in production. `/api/openapi.json` replaces them
there, behind the credential check. The REST bridge itself stays, because it is a
transport a client uses, not documentation.

Two rules follow for the serverless build:

- `@nestjs/swagger` stays in `EXTERNALS` in `apps/api/scripts/build-func.mjs`, because
  `swagger-ui-dist` resolves its assets from disk at runtime and cannot be bundled.
- Anything external must be **vendored**, and vendoring follows non-optional
  `peerDependencies`, not only `dependencies`. Nest packages declare their runtime
  needs as peers, so following `dependencies` alone ships a function that throws
  `MODULE_NOT_FOUND` on the first request. Adding a name to `EXTERNALS` without
  checking it lands in `.vercel/output` breaks production, and the build stays green.

## A request body has a size

`apps/api/src/http/http-config.ts` holds the numbers and
`request-size.middleware.ts` holds both guards. `MAX_REQUEST_BYTES`
(`@crm/db/http`, 16 MB) is the ceiling the whole stack shares, and it sits above
the largest attachment upload the conversation contracts accept.

- **A declared body over the cap is refused before it arrives.**
  `requestSizeLimit()` reads `content-length` and answers 413. `/api/auth/*` gets
  its own smaller cap, because a sign-in body is a few hundred bytes.
- **tRPC reads a capped body.** `express.text` is mounted on
  `/api/trpc` with the same limit, so `raw-body` stops reading past it and tRPC
  gets the string it would have read itself. `nestjs-trpc` does not expose
  tRPC's own `maxBodySize`, which is why the limit is mounted in front of it.
- **The stream itself is capped upstream**, in `deploy/Caddyfile` and in the
  app's `/api/[...path]` proxy. The proxy is where a browser's `content-length`
  becomes a chunked body, so it carries the cap the API cannot see.

## Two mail providers, one pipeline

`apps/api/src/mailbox` is everything neither Google nor Microsoft owns:
`MailboxApiClient` (bearer GET, and the one place a status code becomes an outcome),
`SyncStateService` (the `MailboxSync` row), `MailboxTokenService`,
`MailboxMatchService`, `participants.ts`, `message-text.ts`, and
`ThreadWriterService`.

- **`ThreadWriterService.store` is the only writer of `EmailThread`, `EmailMessage`
  and the `EMAIL` activity.** Gmail and Outlook each parse their own wire format down
  to one `IncomingMessage` and hand it over; matching, threading, counting and
  stamping happen once. A second copy of that is how a rule like *reply before you
  create a company* comes to be true in one inbox and not the other.
- **A thread is keyed by RFC message id, not by the provider's thread id.** Root comes
  from `References` → `In-Reply-To` → own `Message-ID`, so a rep on Gmail and a rep on
  Outlook land on the same `EmailThread` for the same conversation. Graph only returns
  `internetMessageHeaders` when `$select`ed and not for every message, so Outlook falls
  back to `outlook-conversation:<conversationId>` — threading that still holds inside
  Outlook, just not across to Gmail.
- **`MailboxSync.source` is the discriminator** — `calendar`, `gmail`, `outlook`. Each
  provider's module only ever sees its own, and `sync/mailbox-sync.service.ts` is the
  one place that dispatches. One cron, one budget:
  `POST /internal/sync/mailboxes` (`/google` is kept as an alias so an existing
  deployment's cron keeps working).
- **Every mailbox reads in two directions.** `MailboxSync.cursor` is the forward
  position, a `historyId` for Gmail and the last `receivedDateTime` for Outlook.
  Graph has no mailbox-wide delta, so the Outlook cursor is re-read with a
  one-second overlap; `rfcMessageId` is unique, so the overlap costs a duplicate
  fetch and never a duplicate row.
- **`MailboxSync.backfill` is the backward position**, one JSON blob parsed by
  `mailbox/backfill-cursor.ts`: the phase, the opaque page token or
  `@odata.nextLink`, the `before` anchor, the `floor` date, and how far back it
  has read. **Sent mail is phase one**, because `ThreadWriterService.store` drops
  an inbound reply whose thread has no outbound message yet. A null column
  means no backfill is planned yet, so an existing row starts one on its next
  tick. `MailboxSync.importSince` is what the person asked for; the plan clamps it
  through `clampImportSince`. Both directions share one budget per tick
  (`MAILBOX.sync` in `mailbox/mailbox.config.ts`, sizes from
  `MAILBOX_SYNC_MAX_PER_TICK`, `MAILBOX_SYNC_BACKFILL_CHUNK` and
  `MAILBOX_SYNC_PAGE_SIZE`, see `docs/environment.md`), and **the forward read
  takes its share first**, so new mail is filed within one tick of arriving
  however long the backfill runs. Gmail's share is clamped by its API quota
  (`GMAIL_QUOTA`, 240 `messages.get` per tick at 80 % of 6,000 units a minute),
  so the operator's cap raises Outlook and IMAP only. **Every mailbox also gets a
  deadline**: `runDue` splits the tick budget (`TENANCY.loop.budgetMs` hosted,
  `SYNC_TICK.selfHostBudgetMs` otherwise, minus a settle reserve) evenly over the
  mailboxes still due, and each provider stops between two messages when its
  deadline passes, persists the position and returns. That is what keeps one
  tenant's first import inside its `forEachTenant` budget, so the tenant is never
  reported as failed and the next tick's forward read is never held behind a
  detached backfill. **The plan's `importThreads` cap holds exactly**:
  `importCapRemaining` is read before every page and each batch is cut to the
  threads still allowed, and a message opens at most one thread. A rate limit
  persists the position and pauses, it never resets it.
- **Microsoft has no token-revocation endpoint.** `revoke` clears the columns and the
  UI says the consent itself is removed in the user's Microsoft account. Google's still
  posts to `oauth2.googleapis.com/revoke` and refuses to clear if that fails.

## Not every address on a thread is a person

`externalParticipants` (`mailbox/participants.ts`) is the one gate, discarding **us**
(allow-list domains, `User` table), **rep decisions** (`SuppressedContact`,
`SuppressedDomain`), and **addresses no human reads**.

- **`isMachineDomain` (`companies/domain.ts`) sits beside `FREE_EMAIL_DOMAINS`**;
  `domainFromEmail` returns null for both, and `companyForEmail` is the only path from
  address to company — so a caller ignorant of the rule still cannot create one.
  `.calendar.google.com` covers shared calendars, rooms and ICS feeds.
- **Matches the host, never a substring** — `calendar.acme.com` is a real company.
- **`isMachineAddress` also catches opaque local parts** (24 hex chars, UUIDs),
  deliberately narrow: a false positive is a real customer never filed.
- **It leaves no row** — a rep may still type these into quick-add; only the *inbox*
  is barred from deciding. `syncAttendees` filters the same addresses beside
  `attendee.resource`.
- **`isAutomatedAddress` is a separate list about the local part** (`sales@`,
  `noreply@`), which is why `support@acme.com` never becomes a lead.

## People on a deal

`DealContact` is the join, and `deals.attachContact` / `detachContact` /
`setContactRole` are the only ways to write it. `deals.contactOptions` is what the
picker reads.

- **A contact on a deal works at that deal's company**, enforced in the service and
  not merely by the picker — the same rule as `companies.setPrimaryContact`.
- **Attaching is an upsert and re-attaching keeps the role already there**, so a
  double click cannot blank what somebody typed.
- **Detaching removes the row, never the contact.** They stay in the CRM, on the
  company, with their history.
- **`role` is blanked to null, never stored as `""`** — `blankToNull`, as everywhere
  else.

## A rep edits only what the rep wrote

`activities.update` changes the subject, the body, and for a task the due day.
`activities.remove` deletes the row. Both go through `isEditable`
(`activities/editable.ts`): kind `NOTE` or `TASK`, `meta` is null, and
`createdById` is the signed-in user. The one exception to null `meta` is the win
back follow up task (`{ winBack: true }`): it is assigned to the rep, so the rep
moves it. A synced mail, a meeting, and anything the agent or tracking wrote stay
read only. `Activity` has no `archivedAt`,
so a delete is final. After it, `lastActivityAt` is recomputed for the company,
contact and deal; a failure there is logged, never thrown.

## A task is due on a day, not at an instant

`Activity.dueAt` stays a timestamp, but it means a calendar day. The composer sends
the start of the chosen day in the rep's timezone (the date picker's local midnight,
as ISO), and that is what is stored. Nothing migrates; the existing rows already hold
exactly that.

- **A task the API writes itself is stored at noon UTC**, `dueOnDayOf`
  (`activities/due-date.ts`). A sweep has no rep and therefore no timezone, and
  noon reads as the intended calendar day from UTC-11 to UTC+11. Start of the UTC
  day does not: a rep west of UTC reads it as the day before. The win back
  follow-up is the one writer today.
- **A task is due for the whole day and overdue once that day ends.** The API has no
  timezone, so it uses the stored instant plus one day: `overdueBefore(now)`
  (`activities/due-date.ts`) is `now - 24h`, and a task is overdue when
  `dueAt < overdueBefore(now)`. `myTasks`'s `overdue` and `upcoming` windows and the
  dashboard's overdue list are the only date windows, and all three go through it.
  On the day daylight saving switches the boundary moves by one hour; that is the
  cost of not storing a timezone.
- **The UI counts calendar days, never hours.** `daysUntil(dueAt)`
  (`components/local-date-time.tsx`) is the difference between the rep's today and
  the due day; overdue is `daysUntil < 0`. The label is `Due` plus
  `LocalRelativeDate` (today, tomorrow, in 2 days) or `Overdue by {n} days`. Never
  `LocalRelativeTime` on a due date: hours off a midnight read as nonsense.
- **The `upcoming` filter orders by `dueAt` ascending, undated tasks last**, then
  newest first, so the pinned block at the top of the All tab shows the task due
  tomorrow before a task with no date. Every other filter keeps `occurredAt` desc.
  The Upcoming tab renders that same order as one section, not grouped by the day
  the task was written.
- **A day marker compares local day keys**, `localDayKey` in
  `components/local-date-time.tsx`, never `slice(0, 10)` of an ISO string: at 23:30
  east of UTC the UTC date is already tomorrow.

## Deleting a record is archive first, purge later

`contacts.archive`, `companies.archive`, `deals.archive` set `archivedAt`. Nothing
else changes — no suppression, no cascade cleanup, no stamp recompute — because the
row is still there, just filtered out of every list.

- **`archivedFilter(input.archived)` is in every `buildWhere` and every `facetCounts`
  where.** A list call defaults to `archived: false`; the Archived view is the same
  procedure with `archived: true`. There is no third "everything" mode — mixing
  active and archived rows in one table is exactly what this feature removes.
- **`archive`/`restore` are a bare `update({ archivedAt })`, nothing more.** They do
  not touch `AgentTask`, `SuppressedContact`, or `lastActivityAt` — the record is
  unchanged, only hidden.
- **`purge` is the old `delete`.** Same transaction, same suppression, same
  `AgentTask`/`AgentEvent` cleanup, same `ActivityStampService.recomputeAfterDelete`.
  Read the rest of this section as `purge`'s contract, not `archive`'s.
- **A rep can `purge` straight from the Archived view — retention is a ceiling, not a
  wait.** `bulkPurge`/the per-record "Delete forever" action call it directly, no
  different from the cron.

**Pruning**: `ArchiveRetentionController` (`internal/archive/prune`, `CRON_SECRET`-gated,
`apps/api/vercel.json`) reads `AppSetting.archiveRetentionDays`
(`readArchiveRetentionDays`, `@crm/db/settings`, default 180) and calls each service's
`purgeExpired(before)` — `findMany({ archivedAt: { lte: before } })` capped at
`ARCHIVE.prune.maxBatch` (`archive/archive-config.ts`), then `purge` per row through
the ordinary `runBulk`. Settings → General has the day count
(`settings.archiveRetention` / `setArchiveRetention`).

Below is `purge`'s contract — everything that used to be `delete`'s:

- **A purged contact is suppressed by address**, or the sync recreates them from the
  next thread. `ContactsService.purge` writes `SuppressedContact`, and
  `externalParticipants` drops it like a `SuppressedDomain` — one filter covering
  contact creation, company auto-creation and attribution.
- **Keyed lower case.** `normalizeEmail` (`crm/values.ts`) is the one canonicaliser,
  on `contacts.create`, `.update` and the suppression; conflict checks and `allowAgain`
  match case-insensitively.
- **The address comes from the delete itself**
  (`tx.contact.delete({ select: { email: true } })`), not a read before it — and the
  404 is that statement's own `P2025` through `translate`.
- **Adding them back lifts the suppression** via `allowAgain` **inside the write's
  transaction**. Never automatic.
- **Purging a company does not suppress its domain** — its people survive with no
  company, and domain suppression stays the explicit Settings → Connections control.
- **Clear `AgentTask` and `AgentEvent` yourself** — they carry `contactId`/`companyId`
  with no foreign key, so nothing cascades.
- **Recompute `lastActivityAt` on exactly the records the purge reached.**
  `ActivityStampService.targetsOf(where)` collects them *inside* the transaction (the
  evidence is what gets deleted); `recomputeMany` restamps. A company's `where` must
  follow its deals: `{ OR: [{ companyId }, { deal: { companyId } }] }`.
  `recomputeAll()` is for a purge only.
- **Recompute after commit, logging rather than throwing** — the row is already gone,
  and a raised error makes the browser skip invalidation and retry into a 404.

## Sample data is a button, not a shell

A stranger with no mailbox at hand sees an empty CRM and cannot tell whether it
works. `sampleData.load` fills it: 25 companies, 40 contacts, 12 deals, 29 threads
and 89 messages, every row carrying the `demo-` prefix from `DEMO.prefix`
(`apps/api/src/demo/demo-data.ts`). `apps/api/scripts/demo-data.ts` is the same two
functions behind a CLI, so the script and the button cannot drift.

- **This is not `RELOOP_DEMO`.** That variable drives the operator's scripted tour
  and is untouched by any of this.
- **Owner only**, through `canLoadSampleData` (`@crm/auth/roles`), in the service
  and in the status the UI reads. A member sees the banner and no button.
- **It only loads into an empty CRM.** A non `demo-` Company, Contact, Deal or
  EmailThread refuses the load, and so does a connected mailbox, because real rows
  are already on their way. Nobody mixes 40 fake contacts into 2000 real ones by
  accident.
- **One transaction, one advisory lock.** `pg_try_advisory_xact_lock` inside the
  same transaction that writes (`DEMO_DATA.lock.key`, `demo/demo.config.ts`), so a
  second load is refused rather than queued, and a failure halfway leaves no half
  filled CRM. The guards run inside the lock, or two callers both pass them.
- **A banner on every page while the rows are there**, from the app layout. The
  twelve demo deals count in the pipeline and in the dashboard sums, so a person
  who connects a real mailbox later must not read the total as revenue.
- **Presence is one client query with a stale time**, not a cookie and not a query
  per page render: `sampleData.status` is read by the banner, cached by
  react-query, and invalidated by the two mutations that are the only things that
  can change the answer. A cookie is wrong here for the reason in *Gates in
  `proxy.ts`*: the fact reverts on a database reset while the marker insists.
- **Removing deletes exactly the prefixed rows** and the `AgentTask` and
  `AgentEvent` rows that point at them. Nothing a person brought here is touched.
- **No agent work is ever queued or run on a `demo-` row**, so a stranger's model
  budget is not spent inventing facts about companies that do not exist. The prefix and
  the predicates are `@crm/db/sample-data`. `AgentTriggerService` refuses one at every
  write it makes: `enqueue`, `backfill`, `fieldBackfillRecords` and `createEventTask`.
  Without that, `BackfillService.companiesNeedingArtwork` matches on `logoUrl: null`
  alone, so the sign-in sweep books a `brand` task for all 25 sample companies, every
  five minutes. The agent's own guards are in *Sample data is never researched* in
  `docs/agent.md`.

## A quote in the mailbox becomes a deal, one click at a time

`apps/api/src/quotes` reads what the agent already decided. `ThreadInsight.outcome`
of `QUOTED` or `OPEN_OFFER_OURS` means an offer went out, so `quotes.list` is every
such thread that still has no deal. **It classifies nothing and queues no
`AgentTask`** — the reading happened in `apps/agent` long before.

- **The stage comes from the enum, never from a label.** `QUOTE_DEAL_STAGE`
  (`@crm/db/quote-deals`) is `CONTRACT_SENT`, and the list and the table read the
  operator's own wording through `dealStageLabelFrom`.
- **Nothing is created on its own.** `quotes.createDeal` takes the caller as
  `Deal.ownerId`; there is no guess and no sweep. `quotes.dismiss` is the other
  half, and both write `EmailThread.quoteHandledAt`, so a handled thread never
  returns. The write is an `updateMany` guarded on `quoteHandledAt: null`, which
  is what stops two clicks making two deals.
- **The deal is created with no amount.** The agent extracts no figures from a
  quote, so `amount`, `baseAmount` and the rate stay null and the rep types the
  number. See `docs/currency.md`.
- **The quantity rule is the win back list's rule**, `minimumFor`
  (`@crm/db/contact-worth`) over `AppSetting.winBackRules`. A quote with no
  quantity, or below the minimum, is not on the list. `QUOTE_DEALS`
  (`@crm/db/quote-deals`) holds the rest: a 120 day window, one row per company,
  50 rows, a 500 row scan.
- **Sample data is excluded** (`NOT_SAMPLE_RECORD` on the thread). A deal made
  from a `demo-` thread carries a real id, so every `demo-` guard in
  `AgentTriggerService` stops seeing it.

## Billing is a webhook, not a form

`apps/api/src/billing` sells the hosted plans through Stripe and nothing else
touches a plan. `billing.overview` reads the registry row and, when a customer
exists, Stripe's customer and invoices; `billing.checkout`, `setAddOn`,
`cancel`, `resume` and `portal` write to Stripe and apply the returned
subscription at once. `POST /api/billing/webhook` is the source of truth: it
verifies the signature, fetches the subscription named by the event and calls
the one writer, `BillingService.applySubscription`, which sets registry
`plan`, `paid_until`, `grace_until` and `billing`, and `AppSetting.plan` in
the tenant database. Every event, in any order, twice, lands on the same
state, because the state comes from Stripe's subscription and never from the
event body. The raw body is mounted in `create-app.ts` before Nest, the path
is open in `tenantMiddleware`, and the tenant comes from the subscription's
`metadata.tenantId` or from the customer id in `billing`. Every `billing.*`
mutation takes `SessionOnlyMiddleware` and the owner or admin role. A
self-hosted install answers `configured: false` and refuses every mutation. A
suspended tenant reaches `/api/auth/*` and `billing.*` only (`openWhileSuspended`
in `tenant.middleware.ts`), which is how a paused workspace pays its way back
in; `applySubscription` sets it `active` again.
`billing.checkout` refuses a plan that holds fewer contacts or mailboxes than the
workspace has now, before any Stripe call. The current plan is never refused, so
the interval can always change. `planChangeExcess` is the rule, and
`billing.plans` sends its answer per plan, so the list and the refusal agree.
`billing.plans` is a separate query that only the open plan list reads, so the
paused page's poll of `billing.overview` counts nothing. `readCapacityUsage`
(`mailbox/sync-state.service.ts`) is the one count, for billing and for the usage
page. Contacts count archived rows too, because the contact limit trigger counts
them. The customer portal cannot change a plan (`subscription_update` is off in
`scripts/stripe-setup.ts`, which also turns it off on an existing configuration).
A plan that still arrives by webhook below the current usage is applied, because
Stripe has charged, and `applySubscription` logs a warning.

**A step up is billed now. A step down waits for the paid period.**
`changeTiming` is the rule: a plan with a higher or equal monthly list price on
the same interval, and a switch from monthly to yearly, are billed now. A plan
with a lower price, and every switch from yearly to monthly, wait for
`current_period_end`. The same holds for add-ons: a bigger count is billed now,
a smaller count waits.

A change billed now is one `subscriptions.update` with `always_invoice` and
`payment_behavior: "pending_if_incomplete"`: Stripe charges the proration at
once, and the change only lands once it is paid. An unpaid change returns the
hosted invoice URL and the page sends the owner there. `billing.previewPlan`
and `billing.previewAddOn` run the same change through `invoices.createPreview`,
so the confirmation shows the amount Stripe will charge.

A change that waits is a Stripe subscription schedule, never a timer of our
own. `scheduleTarget` creates the schedule from the subscription
(`from_subscription`) when none exists, then writes two phases: the current one
as Stripe returned it, and the target items for one more interval with
`proration_behavior: "none"` and `end_behavior: "release"`. The registry row
does not change: the plan, the limits and `billing.addOns` stay what the
customer paid for. When the phase switches, Stripe changes the subscription's
items and posts `customer.subscription.updated`, and `applySubscription` writes
the new plan like any other update. No `subscription_schedule.*` event is
needed. `billing.overview` reads the schedule live (`scheduled`: the phase after
`current_phase`, or null), so nothing is stored that could drift. A second pick
while a change waits updates the same schedule and replaces the target; a
smaller add-on count keeps a waiting plan and lowers the add-on in its target.
`billing.cancelScheduledChange` releases the schedule, and so does every change
billed now, because Stripe refuses a direct item update on a subscription a
schedule manages: an upgrade, a bigger add-on count and a cancellation drop the
waiting change, and the page says so in the confirmation. `planChangeExcess`
runs at scheduling time too, and the confirmation tells the owner the workspace
must fit the new limits by the switch date. The preview of a waiting change
answers `effectiveAt` and zero due now, without a Stripe call.

A Stripe error on a preview or an update is logged with Stripe's own message
and reaches the page as "Stripe refused this change", never as a bare 500. A
yearly plan needs a card, read from the subscription's `default_payment_method`
first and the customer's default second.
**Checkout ends the trial.** The session carries no `trial_end`, so billing
starts the day a trialing workspace pays. The customer is created before the
session, with the oldest owner's address and `preferred_locales` from the
workspace language. `checkout.session.completed` and every
`customer.subscription.updated` set the locale again and copy the subscription's
card to the customer's `invoice_settings`, so the portal and later invoices use
it, and a customer created before this rule catches up on its next update.

**Billing mails come from `BillingMailService`** (`mail/billing-mail.service.ts`),
through the same Resend sender as the sign-up code, in the workspace language, to
the oldest owner. The webhook sends "plan active" for a new subscription and for
an update whose `previous_attributes` show a different plan or interval, never
for an add-on proration or a renewal, which Stripe's own receipt covers. It also
sends one for a failed payment, a scheduled end and an ended plan; the tenant sweep sends the trial reminder
(`TENANCY.trial.reminderLeadMs` before the end), the trial end and the pause
after the payment grace. Each mail claims a key in the registry's `billing_mail`
table first (`paid:<invoice>`, `ending:<subscription>:<cancel_at>` and so on), so
a retried webhook, the mutation path and a second instance send it once. Without
`RESEND_API_KEY` and `MAIL_FROM` nothing is claimed and nothing throws. Receipts
and invoice PDFs are Stripe's own mails, switched on in the Stripe Dashboard.
`docs/environment.md` has the variables, the script and what stays by hand.

## Money

A deal is sold in one currency and reported in another, and **only `baseAmount` may
ever be summed**. The rules — `baseCurrency`, `countedWhere`/`pendingWhere`, frozen
rates, the supported currencies, the keyless feed, and why the fetcher is the one
documented exception to *no intelligence in the API* — are in **`docs/currency.md`**.
Read it before touching any amount, total, chart or rate.

## Freshness: invalidate the query, don't disable the cache

- **Invalidate in `onSuccess` through `useCrmCache()`** (`lib/trpc/cache.ts`), never by
  listing keys at the call site. Say what changed — `cache.deal(id)`,
  `cache.company(id)`, `cache.contact(id)`, `cache.activity()`. **A new mutation adds a
  call there, not a new list of keys.**
- **A deletion is `cache.removed(ref)`** — one wide fan-out, and the only place
  `refetchType: "none"` is right: the deleted record's `byId` query is still mounted
  while the sheet animates shut, so refetching reads a 404 into the closing sheet,
  while leaving it alone serves 30s of a dead record from cache.
- **`{ settle: "record" }`** for inline editors, so the field's spinner clears without
  waiting for the table.
- **Infinite queries need `pathKey()`, not `queryKey()`** — the latter stamps
  `{ type: "query" }` and silently cannot match `{ type: "infinite" }`.
  `activities.timeline` is read both ways.
- **`cache-manager` is per-value and opt-in**, not an interceptor;
  `AuthService.getProfile` is the model.
- **Background writes need polling, not invalidation** — `refetchInterval` while
  `PENDING`/`RUNNING`, via `isEnriching()` and `ENRICHMENT_POLL_MS`. **Lists poll too,
  not just the sheet.**
