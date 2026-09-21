# Environment

Setup, DB commands, Google Cloud and the `vercel env pull` hazard: `docs/setup.md`.

## One `.env`, at the repo root

`.env.example` **is the documentation**: every variable the repo reads, with a note,
and nothing that is not read. `packages/env` walks up to the workspace root and reads
`.env`, then `.env.local` on top.

- **Real environment variables always win**: the loader never overwrites
  `process.env`, so Vercel/Docker/CI takes precedence.
- **Never add a per-package `.env`.** Four once existed with duplicate
  `DATABASE_URL`/`BETTER_AUTH_SECRET`; when they drifted the API minted a cookie the
  app could not verify and the browser bounced between `/sign-in` and `/` forever.
- **The root marker is a `package.json` declaring `workspaces`**: stopping at the
  first `turbo.json` resolves the API's root to `apps/api`.

## `NEXT_DIST_DIR`, unset by default

The folder `next build` writes into. Unset it and Next.js writes `.next`, which
is what `next start` and both Docker images read.

Set it only for a deploy that must answer requests while the new build runs:
build into `.next-build`, rename the folder afterwards, then restart the app.
Turbo treats the value as part of the build hash, so a relocated build never
reuses the cache of a normal one.

## A new variable has three homes, not two

`.env.example` and, if the API reads it, `env.validation.ts` are the two people
remember. The third is **`globalPassThroughEnv` in the root `turbo.json`**, and it is
the one that bites: Turborepo hides an undeclared variable from every task it runs, so
a deployment that sets the variable perfectly still hands the code `undefined`, and
nothing anywhere says so. That is how `MICROSOFT_CLIENT_ID` shipped with the sign-in
button quietly missing. **`passThroughEnv`, never `env`**: a secret in `env` is a
cache key, which means a cache miss on every rotation and the secret in the cache
metadata. The root file's comment has the whole account.

## Required

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ALLOWED_SIGN_IN`. Everything else has a
localhost default or is genuinely optional.

**`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`** are the sign-in button *and* the
Gmail/Calendar sync: optional, so an SSO-only install needn't create a Google project,
but both values enable the provider. An incomplete pair disables that provider and logs a warning.

**`MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET`** are the same bargain for Entra
ID: the other sign-in button *and* the Outlook mail sync, one app registration, the
same pair rule. **`MICROSOFT_TENANT_ID`** defaults to `common` and is the only one of
the three that is genuinely optional on its own: set it to your tenant's GUID to
refuse other tenants at Microsoft instead of at `ALLOWED_SIGN_IN`. There is **no
Microsoft equivalent of `hd`**: `tenantId` is the whole of it.

**All three pairs can be typed on Settings, Connections instead**, on a hosted install
and on a self-hosted one. A saved pair is sealed in `AppSetting` and **wins over the
line in `.env`**, because a person just typed it. Clear it there and the file decides
again. The API restarts itself so the new value reaches the `auth` instance. See
`docs/connections.md`.

**Neither pair is required.** Password sign-in, an available OAuth provider, or an SSO provider supplies account access.
Incomplete optional credentials disable that provider. They do not prevent API startup.

**`ALLOWED_SIGN_IN`**: comma-separated whole domains or single addresses (bare
addresses exist for a solo self-hoster, where `gmail.com` would be an open door). **One
list, read by the sign-in guard *and* the sync's "which side is external" decision**:
if they drifted a colleague would be refused at the door or filed as a lead. **An empty
list fails closed.** Parsed on demand. `packages/auth/src/workspace.ts`.

## Where things are

- **`API_URL`** (`:3001`) mints session cookies and serves `/api/auth/*`;
  `next.config.ts` republishes it as `NEXT_PUBLIC_API_URL`, so one variable does both
  sides. `BETTER_AUTH_URL` is a legacy fallback.
- **The API dev command compiles before each start.** `apps/api/scripts/dev.ts` watches API source, tsconfig, and shared packages.
  A successful build restarts `dist/main.js`. A failed build leaves the previous process running.
  The next successful build replaces that process.
- **`APP_URL`** (`:3000`) is also the trusted-origin and `callbackURL` allow-list.
- **Every OAuth `redirect_uri` is built from `API_URL`, never `APP_URL`.** Better
  Auth serves `/api/auth/*` at `baseURL`, and `baseURL` is `apiUrl`. A redirect
  built from `APP_URL` points at the web app, where `/api/auth/callback` does not
  exist, and the provider rejects it with "redirect_uri did not match". This is
  invisible until someone sets `APP_URL` to a tunnel or a LAN host, at which
  point the redirect silently becomes that host. `ssoCallbackBase()` is the
  pattern; `slackRedirectUri` in `auth.ts` once was not.
- **`AUTH_COOKIE_DOMAIN`** only for API and app on different subdomains of one parent.
- **`AGENT_URL`** is the agent's deployment, server-side only, and **must include the
  scheme**: validated at boot, or it throws when a task is queued instead.
- **`AUTH_COOKIE_PREFIX` is `crm`** (`@crm/auth/cookies`), set on **both**
  `advanced.cookiePrefix` in `auth.ts` and `getSessionCookie(request, { cookiePrefix })`
  in `proxy.ts`: one alone redirects every signed-in request. Better Auth's default
  collides with any neighbour on a shared parent domain, silently: sign-in completes,
  the row is written, every reader resolves `null`. **Changing it signs everybody out.**

## `IS_MARKETING`, landing page flag, off by default

`"true"` serves `app/(landing)` at `/`; anything else sends a signed-out visitor to
`/sign-in`, because the page markets *this* product.

- **Only the literal `true`** (same shape as `PRISMA_LOG_QUERIES`).
- **It decides one thing**: what a stranger at `/` sees.
- **`isMarketing()` (`apps/app/lib/env.ts`) reads per request**, so a config change
  needs no rebuild. Declared in `apps/app/turbo.json` `passThroughEnv`.

## `GOOGLE_SITE_VERIFICATION`, unset by default

Google Search Console proves that the site belongs to you. The DNS method needs
a TXT record at your domain provider. The HTML tag method needs this variable:
paste the token Search Console shows for "HTML tag", without the surrounding
meta tag. The app then writes the tag into every page of the public site.

## `RELOOP_PLANS`, off by default

The Plan card in Settings names the limits of a hosted plan. A self-hosted
install has none, so the card only renders when `RELOOP_PLANS` is the literal
`"true"`. The operator of a hosted install sets it; nobody else does.

## `RELOOP_MANAGED`, off by default

An install that an operator keeps up to date: the hosted Cloud, or a server that runs
from source under systemd. When it is the literal `"true"`, the Version card shows the
version and the state only, with one sentence that the operator updates the install. No
command, no Update button, no dot on the settings icon. `managedInstall()`
(`apps/app/lib/operator.ts`) reads it on the server, next to `plansOffered`. The API
reads it too: `system.update` answers `refused` and `system.version` reports
`updaterAvailable: false`, even when an updater answers. Declared in
`env.validation.ts`, the root `turbo.json` and `apps/app/turbo.json`.

## `RELOOP_REGISTRY_URL` and `RELOOP_TENANT_DATABASE_URL_TEMPLATE`, off by default

Hosted mode: one Postgres database per customer, one API process for all of them.
Both are unset on a self-hosted install, which then runs as one workspace on
`DATABASE_URL` and reads none of this.

- **`RELOOP_REGISTRY_URL`** names the registry, a small Postgres database with three
  tables (`tenant`, `tenant_sign_in`, `tenant_site`), read through `pg` by
  `packages/db/src/tenancy.ts`. `ensureRegistrySchema()` creates them; the SQL is
  idempotent. Setting the variable is what turns hosted mode on: `isHosted()` in
  `@crm/db/tenant-context` reads it on every call, never at import.
- **`RELOOP_TENANT_DATABASE_URL_TEMPLATE`** is required in hosted mode and holds
  `{db}`, replaced with the tenant's `db_name`. `DATABASE_URL` is not read.
- **`db` from `@crm/db` is a Proxy** to the current tenant's `PrismaClient`, held in
  an `AsyncLocalStorage` (`runAsTenant`, `currentTenant`). Outside a context it
  throws `TenantContextMissing`. Clients live in a bounded LRU
  (`TENANCY.clients.max`, `packages/db/src/tenancy-config.ts`).
- **The tenant is resolved once per request**, in `tenantMiddleware`
  (`apps/api/src/tenancy`), mounted before Nest so `/api/auth/*` is covered: the
  API-key prefix `crm_<tenantId>_…`, then the signed `crm.tenant` cookie, then the
  site id on `/api/t/config/:siteId`. The collector resolves the site id from its
  body in its controller. `/health` and `/internal/*` carry no tenant: the cron
  routes loop over every active tenant through `forEachTenant()`, one at a time,
  and a failing tenant does not stop the others.
- **`ALLOWED_SIGN_IN` is optional in hosted mode** and ignored: `allowList()` in
  `packages/auth/src/workspace.ts` reads the tenant's `tenant_sign_in` rows.
- **Off in hosted mode**: the stored OAuth credentials (`loadStoredOAuthApps`), the
  self-restart after saving them (`unavailable`), and Google's `hd` hint.
- **The app resolves the tenant from the `crm.tenant` cookie** in
  `apps/app/lib/tenant.ts`: `inTenant()` runs every direct `db` read of the app
  (`lib/session.ts`, `lib/mailbox-connection.ts`, the eve bridge route) inside
  `runAsTenant`, and answers `null` without a cookie. The bridge token carries
  `tenantId`. Signing in is email first: `/sign-in` posts the address to
  `POST /api/tenant/lookup`, which sets the cookie and names the sign-in methods
  of that workspace. `/get-started` is the sign-up form and posts to
  `POST /api/tenant/signup`; without hosted mode it stays the waitlist. Both
  bodies and answers are parsed with `@crm/validation/tenant-signup`.
- **The guard `tools/tenancy-guard.ts`** runs with `bun run lint` and refuses
  `new PrismaClient` outside `packages/db/src/client.ts` and a
  `process.env.ALLOWED_SIGN_IN` read outside `workspace.ts`.
- **A customer registers through `POST /api/tenant/signup`** and looks their
  workspace up through `POST /api/tenant/lookup` (`apps/api/src/tenancy`). Both
  are open paths in `tenantMiddleware`, rate limited per address and per IP in
  memory (`TENANCY.signup.rate`). Signup provisions the database at once
  (`provisionTenant`, `packages/db/src/provision.ts`: create, migrate, registry
  row, `AppSetting.plan`, all rolled back on failure) with status `pending` and
  the one address in `tenant_sign_in`. The API sends no mail, so activation is
  the first Google or Microsoft sign-in with that exact address:
  `TenantActivationHooks` runs on session create, sets `active`, and registers
  the company domain when the address is not free mail. A tenant still
  `pending` after `TENANCY.signup.pendingTtlMs` (48 hours) is removed.
- **Trials end by a daily sweep** (`TenantSweepService`, in-process in
  production, or `POST /internal/tenants/sweep` with `CRON_SECRET`): `trial`
  past `trial_ends_at` becomes `suspended` (sign-in answers 403
  `TENANT_SUSPENDED`, data kept); suspended for `TENANCY.trial.suspendedTtlMs`
  (30 days) is dumped to `RELOOP_BACKUP_DIR` with `pg_dump`, dropped, and
  removed from the registry. No `RELOOP_BACKUP_DIR` or no `pg_dump` means the
  tenant is kept and an error is logged. Every duration is in
  `packages/db/src/tenancy-config.ts`.
- **`RELOOP_BACKUP_DIR`** is that dump folder, optional. **`RELOOP_BACKUP_REMOTE`**
  is the rclone remote the nightly `deploy/cloud/backup.sh` copies to, optional:
  without it the dumps stay local and the script warns.
- **The CLI `apps/api/scripts/tenant.ts`** does the same by hand:
  `create|migrate|migrate-all|suspend|delete|list`. `migrate-all` marks a tenant
  whose migration fails `migration_failed` and continues; the `migrate` service
  in `deploy/cloud/docker-compose.cloud.yml` runs it before `api` starts.

## `RELOOP_DEMO`, off by default

A floating Play demo button drives a scripted tour of the real app with a fake
cursor, for recording a product video. It only renders when `RELOOP_DEMO` is the
literal `"true"`. `demoOffered()` (`apps/app/lib/operator.ts`) reads it on the
server. The steps and timings live in
`apps/app/components/demo/demo-tour-config.ts`. A normal install leaves it unset.

## `RELOOP_GERMAN`, off by default

**The app ignores this variable.** Every person picks one of seven languages in
Settings > General and the choice lives in the `crm.locale` cookie. An install that
still sets `RELOOP_GERMAN` keeps working and loses nothing. `docs/languages.md` says
how a language is added.

The variable is left for the agent only: with the literal `"true"` the agent writes its
notes and summaries in German instead of English (`apps/agent/agent/lib/language.ts`).
It reaches the agent when you run from source. The agent container in
`deploy/docker-compose.yml` does not receive it.

## `RELOOP_UPDATE_CHECK`, on by default

`system.version` (`apps/api/src/system`) reports the version from the root
`package.json` and asks `api.github.com` for the newest release, no token, a short
timeout, one call per six hours per process. A failed call gives `latest: null`,
retries after `SYSTEM.updateCheck.retryMs`, and keeps the last good answer. The
literal `"false"` turns the call off; the procedure then answers `checkDisabled: true`
and never reaches GitHub. Declared in `env.validation.ts` and the root `turbo.json`.

## `UPDATER_TOKEN` and `UPDATER_URL`, off by default

`system.update` posts to the updater container (watchtower, `deploy/docker-compose.yml`,
profile `updater`) with `UPDATER_TOKEN` as bearer token and a five second timeout. The
updater answers only after it finished, and it restarts the API on the way, so a timeout
counts as `started`. Without the token, or when the updater does not answer, the result
is `unavailable`. A user who is not the workspace owner gets `refused`. Nothing here
throws. `system.version` reports `updaterAvailable` for the owner only, and only while an
update waits: it sends one request without the token and expects `401`. `UPDATER_URL`
defaults to `http://updater:8080`. `install.sh` writes the token; the operator turns the
profile on. `docs/self-host.md` names the trade-off. Declared in `env.validation.ts` and
the root `turbo.json`.

## Typed, validated env

`apps/api/src/config/env.validation.ts` runs via `ConfigModule.forRoot({ validate })`,
and lists every variable the API reads and nothing else.

- **Validation runs while `AppModule` is evaluated**: a test must set variables before
  importing it (see the dynamic `import()` in `test/auth.e2e.spec.ts`).
- **The schema is the API's, not the repo's**: `@crm/auth` and the agent read their own.

## Optional: what the agent can do

Every outside source is optional and the agent runs with none. A missing key removes a
place to look; **never an error, never throws**. `agent/lib/capabilities.ts` is the
single place that knows what is set.

| Variable | What it adds |
| --- | --- |
| `PERPLEXITY_API_KEY` | Open-web research with citations |
| `GITHUB_TOKEN` | Raises the GitHub rate limit from 60/hour |
| `BLOB_READ_WRITE_TOKEN` | Mirrors logos and photos into Blob |
| `OPENROUTER_API_KEY` | The model through OpenRouter, when no key was pasted on Settings → AI. A pasted key wins |
| `AGENT_BRIDGE_SECRET` | The rep-facing Agent panel, see `agent.md` |
| `CODEX_HOME` | Where the Codex login lives and where the agent downloads codex on the first ChatGPT sign-in. Defaults to `~/.codex` |

`BLOB_READ_WRITE_TOKEN` is also in `env.validation.ts` and `apps/api/turbo.json`
because the API and the seed write pictures too. The Next.js app is deliberately
excluded: recognising our URL for the image optimizer needs no token.

### There is no research vendor key

**Context.dev is gone, and `CONTEXT_DEV_API_KEY` must not come back.** The key bought
two places to look and returned almost nothing: on the reference install 2528 of 2537
companies carried a `401 USAGE_EXCEEDED`, three had a logo, and no contact had a
LinkedIn URL. It cost a paid key, an onboarding step and a settings card.

- **Company brand data now reads the company's own website.** `lib/website-brand.ts`
  fetches the homepage through `@crm/db/safe-fetch` and asks the configured model for
  the facts on it. It is the only brand path
  (`apps/agent/test/website-brand.integration.spec.ts`).
- **With no model provider it still answers.** `directModel` throwing falls back to the
  page's own metadata, so a `brand` task never throws.
- **Nothing is lost while a page cannot be read.** A `brand` task settles `SKIPPED`
  *before* anything marks the row `RUNNING`, and `settle` only overwrites `RUNNING`, so
  the company stays `PENDING`, which the sweep re-queues.
- **`AppSetting.contextDevApiKey` is still a column and still holds whatever an
  operator saved.** Nothing reads it. It is left alone on purpose: dropping it would
  destroy a secret somebody pasted, and an empty column costs nothing.

## Mailbox sync

Always on, on whichever social provider is configured, so there is no extra redirect
URI beyond the sign-in one. Scopes are requested at sign-in and gated by
`requireMailboxAccess()`, because granular consent lets a user untick one and still
sign in.

**An SSO rep is not gated**: `needsMailboxGrant` (`@crm/auth`) walls only an account
whose sign-in rows are *all* mailbox providers. It cannot be "has the scopes": an SSO
rep has no Google or Microsoft account to grant on, and `revoke()` keeps the `account`
row, so trying the optional feature and revoking would lock them out. They connect from
Settings → Connections, posting the same `linkSocial` call.

**One granted mailbox is enough.** A rep with both providers linked who granted Google
is not asked for Outlook; `mailboxGrantsNeeded` names the ones still outstanding and
`/grant-access` offers exactly those buttons.

**Microsoft's granted scopes come back fully qualified**:
`https://graph.microsoft.com/Mail.Read`, not `Mail.Read`. `parseScopes` is the one
canonicaliser and strips that prefix, so the comparison is against the bare permission
everywhere.

**Mail reads both ways, the calendar only forwards**: Gmail records the current
`historyId` and Outlook records `now`, then each also reads its own history
backwards from that moment. Calendar reads from `now` and never looks back. How
far back mail goes is `MailboxSync.importSince`, asked on the connection page and
clamped by the plan. See `docs/connections.md`.

**`CRON_SECRET`** (min 16 chars) guards `POST /internal/sync/mailboxes` and
`/internal/sync/rates`; both **fail closed when unset**. `/internal/sync/google` is
kept as an alias of the first, so an existing deployment's cron does not break on
deploy. **Crons live in `apps/api/vercel.json`**: mailboxes `*/5 * * * *`, rates
daily. Minute-level schedules need a Pro plan; on Hobby it silently becomes daily.

Deliberate absences: **no `GOOGLE_SYNC_ENABLED`** (a switch that can disable a mandatory
feature is only ever wrong), **no `GOOGLE_WORKSPACE_DOMAIN`** (`ALLOWED_SIGN_IN` already
says who is internal: two sources is how a colleague becomes a lead), **no
`GMAIL_BACKFILL_DAYS`**, **no `OUTLOOK_BACKFILL_DAYS`** (how far back is a
question for the person connecting the mailbox, not for the operator), **no rate
provider variable**.

## Telemetry is on, and turning it off is one variable

`CRM_TELEMETRY_DISABLED="1"`, or `DO_NOT_TRACK=1`, honoured identically, and nothing
is sent. No client is constructed, so there is no queue waiting to flush later.

- **Server side only**, `posthog-node` in the API and the agent. No browser SDK
  exists anywhere, the landing page included. `docs/telemetry.md`.
- **The destination comes from `POSTHOG_KEY`, `POSTHOG_HOST` and `POSTHOG_UI_HOST`**
  (`packages/telemetry/src/project.ts`). Without `POSTHOG_KEY` nothing is sent.
- **The install ID is a row, not a file**: `install`, one row, UUID written by
  the migration. Vercel's filesystem is ephemeral, so `~/.crm/telemetry-id`
  would count containers.
- Declared in `env.validation.ts` as optional, like everything else here. Every
  event and the never-sent list are in **`docs/telemetry.md`**.

## Not env vars

- **Cache TTL**: `DEFAULT_TTL_MS` (60s) in `cache.module.ts`; `CACHE_TTL_MS` overrides.
- **Redis**: optional; without `REDIS_URL` the cache is per-instance in-memory, which
  is wrong for multi-instance.
- **Sign-in method**: Google and Microsoft are in code; an IdP is a row (SSO, in `api.md`).
