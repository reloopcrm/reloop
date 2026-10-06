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

**Company research runs only on a click.** `companyCreated` queues `brand` alone, for
a company created by hand, from an email domain or on a changed domain, and the
sign-in backfill queues `brand` alone too. The only writer of a `company-profile`
row is `companyRequested`, behind the Research and Re-enrich buttons on the company
sheet and the bulk enrich action. The plan gate (`companyResearch`,
`@crm/db/plans`) still refuses it through `enqueue`.

**Contact research runs for every new contact and never for an archived one.**
`contactCreated` queues `identify` for each contact the mailbox sync creates, named
or not: `contactWithoutCompany` in `ThreadWriterService` and
`MailboxMatchService.addCompanyContact` alike. A contact the sync meets again is
queued only while its name still comes from the address. The gates stay in
`enqueue`: sample data, the Functions switch and the plan. The agent's pre-check
then decides if the research runs. The sign-in backfill (`BackfillService`) takes
the 500 oldest `PENDING` or `FAILED` contacts for `identify`, and every query of the
backfill (`identify`, `portrait`, `brand`) has `archivedAt: null`. An archived row
never takes a place of the pass. A task that finished without ever starting never
counts against a monthly limit: `planAllows` and every other budget count use
`budgetTasksWhere` (`@crm/db/plan-usage`).

About to add a vendor client to `apps/api`? You want `apps/agent/agent/lib`. One
documented exception, for timing: the exchange-rate fetcher, below.

## One organization, and it is not a tenancy boundary

Single tenant. No org header, no org interceptor, no org-scoped cache keys, **no
`organizationId` on any CRM record.**

Hosted mode does not change that: the hosted Reloop Cloud gives each customer a
whole database, from a private overlay. Core code reaches it only through the
port `cloud` from `@crm/db/cloud/scope`, typed by `@crm/db/cloud/contract`, and
`tools/tenancy-guard.ts` refuses an import of any other `@crm/db/cloud/*` module
outside the slot folders. In this repository every slot is a no-op:
`cloud.hosted()` is false; `run`, `hold` and `forEachScope` call the work exactly
once; `resolveClient` returns the one client of `DATABASE_URL`; `byId`,
`activeBySite` and `active` find nothing; the member hooks do nothing. Only
`current()` and `addOns()` throw, because a self-hosted install has no scope:
guard them with `cloud.hosted()` or `cloud.customer()`. `cloudMiddleware()`
(`apps/api/src/cloud/cloud-middleware.ts`) mounts nothing.

Code still has to be ready for the overlay. A process-wide cache key that is per
workspace goes through `cloud.scopedKey()`, and a cron route that serves every
workspace loops through `cloud.forEachScope()`, with `cloud.loop.budgetMs` per
workspace. Work that outlives its request, a detached `void (async …)()`, wraps
itself in `cloud.hold()`. `cloud.run()` takes only a `WorkspaceScope` the port
made (`cloud.byId`, `cloud.active`, `cloud.activeBySite`, `cloud.current`). The
exchange-rate loop fetches the feed once per base currency
(`RatesService.refreshAll`) and writes it to every workspace.

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
- **Removing a member takes the access and keeps the data.** `workspace.removeMember`
  (`SessionOnlyMiddleware`) checks `canRemoveMember`: owner or admin, and an admin never
  removes an owner. Nobody removes themselves, and the last owner stays, with the same
  `FOR UPDATE` count as a demotion. The `user` row stays, because contacts, deals,
  activities, agent runs and more than twenty other relations point at it; it gets
  `removedAt`. The `member` row, every `session` and every `apikey` of the person are
  deleted; no other table points at them. The gate is `removedAt` in
  `databaseHooks.session.create.before`, not the allow-list: a domain on
  `ALLOWED_SIGN_IN` still matches the address, and without the stamp the next sign-in
  would enrol the person again. The granted address in `AppSetting.signInAddresses` is
  revoked too, and `cloud.onMemberRemoved()` tells the hosted Cloud, a no-op here. A
  removed user is left out of
  `users.list`, of the first enrolment in `ensureWorkspaceMembership`, and of the
  mailbox sync (`dueWhere`), so their inbox stops feeding the CRM. `addPerson` with the
  address of a removed person takes them back: it clears `removedAt`, creates the member
  row with the chosen role, sets a new password and grants the address again. No
  second `user` row, so their records
  are theirs again. An active person still gets "That address already has an account."
  Every `addPerson` calls `cloud.onMemberAdded()`, a no-op here, so on the hosted
  Cloud a person whose domain is not registered still finds the workspace at sign-in.
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
  A hosted sign-up already asked for the company, so the hosted Cloud writes that
  name and its slug into the new workspace's row, and `/onboarding` pre-fills both.
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

- **The sync never renames a contact that already exists.** A new contact takes
  its name from the From line through `splitName`. A contact that `resolve`,
  `createContact` or `contactWithoutCompany` finds by address keeps its name, even
  when it is a placeholder ("M Beispiel" at `m.beispiel@`, read by `isDerivedName`).
  A sender line such as "Buchhaltung Beispiel AG" is not a person's name.
  `contact-clean` in the agent upgrades the name on new activity, from the From line
  or the signature, with the rule in `lib/names.ts`.
- **"From us" means any own address, in every mailbox.** `internalIdentity`
  collects users, IMAP accounts, every `MailboxSync.address`, the confirmed aliases
  in `AppSetting.ownAddresses`, the allow-list and the website, and drops every
  freemail domain. `isOwnAddress` makes a message `OUTBOUND` when its sender is one
  of those addresses or sits on an own work domain. So a colleague's mail read by
  another mailbox is ours, and two mailboxes that read one message agree. Gmail and
  Outlook write `MailboxSync.address` from the provider profile on every sync,
  before the first message. The API only reads `ownAddresses`; deciding that an
  address is an alias is the agent's job.
- **Old rows follow the identity.** `DirectionRepairService` runs once per sync
  tick after adoption. It flips `INBOUND` rows whose sender is own to `OUTBOUND`,
  at most `DIRECTION.repairBatch` per tick, and never the other way. Once a pass
  finds less than a batch, it skips until the identity changes, so a new mailbox
  or a new alias corrects the history by itself. It deletes nothing;
  `reactivation.ts` reads `direction` directly. A flipped thread that already has
  a `ThreadInsight` gets a `thread-insight` task through `threadStored` with
  `origin: "backfill"` and `reread: true` in the payload, so the agent reads it
  again although `lastMessageAt` did not move and `unansweredByUs` follows the new
  direction. A task already waiting for the thread takes `reread: true` into its
  payload. Each pass logs the flipped `count` and the number of distinct sender
  domains, never an address. The API only writes the row; the agent decides.

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
  tenant's first import inside its `cloud.forEachScope` budget, so the tenant is never
  reported as failed and the next tick's forward read is never held behind a
  detached backfill. **The plan's `importThreads` cap holds exactly**:
  `importCapRemaining` is read before every page and each batch is cut to the
  threads still allowed, and a message opens at most one thread. A rate limit
  persists the position and pauses, it never resets it.
- **Gmail forward reads every history page.** `listHistory` asks for `messageAdded` and
  `labelRemoved` and follows `nextPageToken` up to `MAILBOX.sync.gmail.historyPages` (20).
  The cursor moves to the `id` of the last history entry whose ids were all fetched, and
  to the response's `historyId` only when every page was read. So a history longer than
  the page cap, the per-tick cap or the deadline still moves forward every tick. A
  message labelled `DRAFT`, `SPAM` or `TRASH` (`MAILBOX.sync.gmail.skippedLabels`), one
  `store` refuses, or one `getMessage` answers with a non-retryable failure (404 gone)
  counts as done and never holds the cursor. A retryable failure (timeout, 5xx) is not
  done, so the cursor stops before its entry and the next tick fetches it again. A `labelRemoved` of
  `SPAM` or `TRASH` (`reenteringLabels`) reads that message like new mail, so mail marked
  as spam by mistake arrives once it is moved out. `WORK_MAIL_QUERY` excludes the same
  three from the backfill.
- **The contact limit never stalls the sync.** `MailboxMatchService.createContact` and
  `ThreadWriterService.contactWithoutCompany` catch the `enforce_contact_plan_limit`
  error (matched by `CONTACT_LIMIT_MESSAGE`, SQLSTATE 23514 arrives as an unknown
  request error) and return no contact. `resolve` answers `limited: true`, `store` keeps
  the thread `PENDING`, and one warning per `LIMIT_WARNING.intervalMs` is logged. The
  mailbox never turns `FAILED` and the cursor moves on. Before `create` makes a new
  company it counts contacts against `limitsOf(readPlan)`, the trigger's own rule, and at
  the limit it creates neither the company nor the contact.
- **A contact who writes again comes back.** `store` calls `reviveContact` for a new
  INBOUND message. The sender first passes `externalParticipants` with the same
  `MatchContext` as contact creation, so a colleague, a suppressed or blocked address and
  a machine or automated sender stay archived. The mail must also be new: lane
  `forward`, or `sentAt` after the contact's `archivedAt`, so a backfill of old mail
  revives nobody. Otherwise the contact with that exact address loses `archivedAt` (and its
  archived company is revived by the same rule as `revive`), and the change is logged
  through `EnrichmentLogService`. Mail the rep wrote does not revive anyone. `adopt`
  applies the same rule with the thread's `lastMessageAt`: when the contact it lands on
  is archived and the rule says no, the thread stays `PENDING`. At the contact limit a
  revive leaves the contact archived and stores the mail.
- **Every sender of a relevant thread from the company's domain becomes a contact.**
  A thread keeps the one contact it was filed under, so `store` and `adopt` alone
  never file a second person who writes into it. `ThreadContactsService` runs once
  per sync tick, **after every due mailbox has synced**, with the deadline
  `tickEndsAt − SYNC_TICK.settleReserveMs`. It stops between two threads at that
  deadline and after `THREAD_CONTACTS.maxCreatesPerTick` new contacts, and it does
  not start when the mailboxes used the whole budget, so it never takes time from
  the forward read or the backfill. It reads threads that have a company or a
  contact and a `ThreadInsight` with `relevant: true`, never the sample data. The
  company is the thread's company, or else the company of the thread's contact; a
  company without a domain or an archived company is skipped. For each INBOUND
  message, `senderVerdict` (`mailbox/thread-contacts.ts`) refuses an own address or
  own domain, a suppressed address or domain, a machine or role address, a free-mail
  address, an `isAutoReply` message and a domain other than the company's, and
  `externalParticipants` is still the one gate. A sender with any contact row,
  archived ones included, is left alone, because `reviveContact` owns revival. A new
  contact goes through `MailboxMatchService.addCompanyContact`, the same insert,
  enrichment-log line and `contactCreated` as `createContact`, owned by the user
  whose mailbox synced the message. The thread's `contactId` never moves; when it is
  empty (a `createFrom: "relevant"` thread filed under a known company) the first new
  contact fills it, and the thread's `EMAIL` activity follows. The activity of an
  occupied thread stays on its contact. **A new contact is dated at its last real
  mail, not at the pass**: the "Contact added from your inbox" log row gets
  `createdAt` and `occurredAt` from the sender's newest mail in the thread, inbound
  from them or outbound to them, never later than now (`EnrichmentEvent.at`). So
  `lastActivityAt` and `recompute` agree, and a contact caught up from a thread of
  May reads as quiet since May. The timeline shows that log row at the mail's date.
  **Every pass stamps known contacts of the thread, whatever the creation policy**:
  each existing, active contact that is not the thread's own gets
  `ActivityStampService.stampThreadMail` with its newest real mail there, inbound
  from them or outbound to them. Automatic replies (`isAutoReply`) never date anyone.
  The stamp moves `contact.threadMailAt` and `lastActivityAt` forward, never back,
  and `recompute`, `recomputeMany` and `recomputeAll` take
  `GREATEST(newest activity, threadMailAt)`, so deleting an activity or reconnecting
  a mailbox keeps the date. `store` stamps only the thread's own contact. A contact that fills an empty slot also carries the thread's `EMAIL`
  activity, like any thread contact. Win back counts mail by `emailThread.contactId`
  and does not count the thread for an extra contact; the `identify` pre-check counts
  it by address. **Only a creating mailbox adds anyone**: the
  message's `syncedByUserId` must own a non-calendar `MailboxSync` with `autoCreate`
  or `createFrom: "relevant"`, and the user must not be removed. A thread that is
  already relevant and already filed stands in for the reply rule of `replied`.
  **The contact limit stops the pass, never the tick**: a limit reached before or
  during an insert leaves the cursor before that thread, so the senders are added
  once the plan grows. **A failed thread stops the pass too**: an error in a thread
  is logged, the cursor stays before it and counts the attempt in its `failed`
  field, so the next tick tries it again. After `THREAD_CONTACTS.maxThreadAttempts`
  failures in a row the pass logs one warning with the thread id and the reason and
  moves past it; a thread that succeeds clears the count.
- **The pass walks a cursor, not the newest threads.** `AppSetting.threadContactsCursor`
  holds `{ v, at, id, failed? }` (`mailbox/thread-contacts-cursor.ts`), where `at` is the
  later of the thread's and the insight's `updatedAt`. Each tick reads
  `THREAD_CONTACTS.batch` threads after it in `(at, id)` order and leaves out rows
  younger than `THREAD_CONTACTS.settleMs` against the database's `now()`, never the
  API clock, so a transaction stamped earlier but committed later is not passed. The
  messages of a batch are read with `left(body, AUTO_REPLY_BODY_CHARS)`, the window
  `isAutoReply` reads, so a long mail never loads in full. A null cursor starts at the oldest thread, which is
  how existing history is caught up after a deploy. New mail moves the thread's
  `updatedAt`, `adopt` moves it, and a new verdict moves the insight's, so the pass
  sees each of them again: new mail in a relevant thread is filed one to two ticks
  after it is stored. `store` has no branch of its own. An unreadable cursor is
  logged and starts again from the oldest thread; a second pass is harmless, since a
  known address is never created twice. **The cursor query has a cost**: no index
  serves `GREATEST` of two columns, so every tick hash-joins all relevant threads with
  a company or contact and sorts the ones after the cursor. That is fine at thousands
  of threads; the batch stays at 100. A tenant far larger needs a stored cursor column
  with its own index.
- **The dry run counts, it never writes.** `bun run thread-contacts --dry-run` in
  `apps/api` runs `ThreadContactsService.preview` inside `cloud.forEachScope`. It
  walks every relevant thread from the start, ignores the cursor, and prints per
  workspace the skipped threads, one verdict per distinct sender, the number of
  contacts it would create per domain, and the active contacts against the plan's
  limit. It prints no address. Without `--dry-run` the script refuses to run; the
  sync tick is the only writer.
- **Turning creation on re-reads history.** `SyncStateService.setAutoCreate(true)` and
  `setCreatePolicy` with any creating policy (`autoCreate` or `createFrom: "relevant"`)
  set `backfill: null`, exactly like `setImportSince`. They also clear
  `AppSetting.threadContactsCursor`, so the thread contacts pass reads every relevant
  thread again and senders it left as `policy-off` are added.
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
the ordinary `runBulk`. **`purgeExpired` skips `source` `EMAIL` and `CALENDAR`**, for
contacts and companies: the sweep archives those on its own, and a purge writes a
permanent `SuppressedContact`. The schema does not record who archived a row, so this
also keeps every synced contact and company a person archived: retention never removes
them, whatever Settings → General says. "Delete forever" by hand still purges them. Settings →
General has the day count (`settings.archiveRetention` / `setArchiveRetention`).

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

- **Every win back person gets a story** (`demo/demo-story.ts`), built from the
  seeded threads only: the gist from the memory, the orders, the last thread, one
  quote that is a real sentence of a seeded mail. `basedOnUntil` is the newest seeded
  mail and `language` is what the person view asks for, so the page never queues a
  `person-story` task for sample data, which `AgentTriggerService` would refuse
  anyway.
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

## The Win back person view is one call

`reactivation.person({ contactId })` (`reactivation/win-back-person.service.ts`)
returns everything the person page shows: the header facts from
`readReactivationCandidate`, the stored story, the brief as the gist until a story
exists, a timeline of won deals and mail, the person's mail newest first with the
marked passages and the follow-up delay. It writes nothing but an
`AgentTask`.

- **The story is the agent's.** The API queues `person-story` through
  `AgentTriggerService.personStoryRequested` when the row is missing, written in
  another language than `summaryLanguage()`, older than the contact's newest mail,
  or does not parse. A missing row is not asked for again within
  `PERSON_VIEW.retryAfterMs` of a finished try, so a person with no business mail
  does not queue a task on every open. A row that does not parse is logged and
  shown as no story. `reactivation.rereadStory` queues it with `reread: true`, but not
  within `PERSON_VIEW.rereadPauseMs` of the last finished story; then it answers with
  `retryAt` and queues nothing.
- **A re-read is never lost behind a waiting task.** When a story task already waits,
  automatic, prefetched or opened, `AgentTriggerService.rereadPendingStory` writes
  `reread: true` into its payload and lifts it to `PRIORITY.personStory`, under the
  same idempotency lock as `enqueue`, so there is still one row. A task the agent has
  already leased is not changed: the agent read its payload at the claim. The call
  then answers with `retryAt`, now plus `rereadPauseMs`, and the rep asks again after
  the story is written.
- **The top of the list has its story before anyone opens it.** Reading
  `reactivation.list` hands the list to `WinBackStoryPrefetchService`
  (`reactivation/win-back-story-prefetch.service.ts`), at most once per
  `PERSON_VIEW.prefetch.everyMs` per workspace (`cloud.scopedKey` in the cache), in a
  detached `cloud.hold`. It takes the first `PERSON_VIEW.prefetch.top` people in the
  list's default order (potential, highest first; the sidebar's read counts) and
  queues `person-story` for each one the same rules as the person view call stale:
  missing, another language, older than the newest mail, or not parsing. The
  `retryAfterMs` pause holds here too, so a person with no business mail is never
  queued again and again. A call with another scope, `rejected` or quiet days reads
  the default list itself instead of reusing the rows.
- **"Continue with" is prefetched as well.** `reactivation.nextPerson` hands the
  person it found to the same check, so the story of the next person is usually
  written while the rep reads the current one.
- **The API decides only who is stale, never what the story says.** It is the same
  deterministic check the person view already makes; no model and no vendor runs
  here. The writes go through `AgentTriggerService.personStoriesPrefetched`, which
  locks each contact with the same idempotency key as `enqueue` and skips anyone with
  an open story task, so a person is never queued twice. Before those it takes one
  transaction lock for the whole prefetch budget and counts the budget inside it, so
  two prefetches that arrive together never both take the last free place. A story a
  rep opens never takes that lock and never waits for it.
- **A prefetch never spends what a rep needs.** It is refused for sample data and when
  story writing is off, and it stops at the budget minus the new-mail reserve minus
  `PERSON_VIEW.prefetch.openShare` of the budget, which stays for stories a rep opens.
  Past that line it queues nothing, so it never leaves a postponed task. A self-hosted
  install without a plan has no line. Each prefetched task counts the moment it is
  written, like every task in `budgetKinds`.
- **An opened person goes first.** A prefetched task carries `PRIORITY.storyPrefetch`,
  below every reading of new mail and above the mail backfill, so the agent's fast lane
  claims it only after the stories reps asked for. When a rep opens a person whose
  prefetched task still waits, `person` lifts it to `PRIORITY.personStory` through
  `personStoryOpened`. A task the budget postponed keeps its date.
- **A reference to a message that no longer exists is dropped on read**
  (`keepKnownMessages`). A message the story names but older than the newest
  `PERSON_VIEW.mails` is added to the list, so "where Reloop knows this from" always
  finds its mail.
- **A mark is a passage of the story or a quote of a `ThreadInsight`**, on the
  message it came from. `key` is the message of the story's quote. `unanswered` is
  the newest message of a thread the agent marked `unansweredByUs`, when it is theirs.
- **The next person is its own call**, `reactivation.nextPerson`, with the list's
  own input (search, potential, scope, quiet, not for us, sort and direction), so
  "Continue with" follows the order the rep came from. It skips anyone without an
  address and is read once per person, not on every poll while a story is written.
- **A story past the plan's budget is held back, not an error.** `storyState.limitUntil`
  names the end of the usage window when the conversation budget, which stories share
  (`budgetKinds`) and of which they leave the new-mail reserve alone, is spent. A story
  task the agent postponed is not "queued" either: its `dueAt` is `limitUntil`, so the
  page stops polling and shows the date.
- **A verdict keeps its note** unless the call sends a new one, and a "bad" verdict
  that turns into "good" or "later" brings the archived person and company back, the
  same as taking it off.
- **`contacts.draft` carries a one-off version beside the draft** (`oneOff`), written
  by `writeDraft` with `oneOff: true`; the stored draft stays as suggested.
- **`followUpDays` is null when the win back follow-up function is off**, so the page
  never promises a reminder the sweep will not write.
- The mailbox link of a message is `mailboxLinkOf` (`mailbox/mailbox-link.ts`), shared
  with `google.thread`.

## The billing seam

The open source build has no billing. Core code injects `BILLING_PORT` from
`billing-port/billing-port.ts`, a `BillingPort` with `cancelNow` and
`healStoredTarget`, and reads the few constants it needs from `BILLING_SEAM`: the
webhook path and size limit, the return path and the rebuild delay. Both methods
take a tenant id, never a registry row: the implementation loads the tenant
itself. `CloudModule` (`cloud/cloud.module.ts`) is global and registered once in
`AppModule`. Here it provides `NO_BILLING_PORT` with `useValue`, so every call is
a no-op, and nothing else. The app's slots in `apps/app/cloud` are empty the same
way: no billing page, no checkout, no marketing pages, no hosted routes
(`HOSTED_ROUTES`), no danger zone on Settings, General (`DangerZone`), no agreement prompt in the
workspace layout (`AgreementGate`), and `/`
sends a visitor to sign in, or a signed-in one to the workspace.

The hosted Reloop Cloud adds the tenancy, billing and its marketing site from a
private overlay. The overlay replaces exactly these files and only adds others:

- `apps/api/src/cloud/cloud.module.ts`
- `apps/api/src/cloud/cloud-middleware.ts`
- `packages/db/src/cloud/scope.ts`
- `apps/app/cloud/scope.server.ts`
- `apps/app/cloud/slots.tsx`
- `apps/app/cloud/slots.data.ts`
- `apps/app/cloud/slots.server.tsx`
- `apps/app/lib/i18n/cloud.ts`
- `apps/app/app/(landing)/page.tsx`
- `apps/api/package.json` and `bun.lock`, for the `stripe` package

The overlay then runs `trpc:generate`, because the router set changes
`src/generated/server.ts`. `apps/app/cloud/contract.ts` and `billing-port.ts`
stay public: both sides build against them. A core test must pass with the empty
slots and with the overlay's, so it reads its expectations from
`apps/app/cloud/slots.data.ts` instead of naming a cloud page.

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
