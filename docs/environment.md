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

## `RELOOP_CLOUD_URL`, unset by default

The address of the hosted Cloud, for a marketing site that runs on another
address: `reloopcrm.com` sells, `app.reloopcrm.com` signs people up. With it set,
every sign-up link ("Try it now" on the pricing page, "Get started" in the
footer) points at `<RELOOP_CLOUD_URL>/get-started?plan=<id>`, and `/get-started`
on this site redirects there with the same plan. Sign-in stays on this site.

- **Only the sign-up links move.** Pricing, docs and sign-in stay here.
- **Unset or empty means off**: the links stay relative. The compose file passes
  `${RELOOP_CLOUD_URL:-}`, so an empty string is the normal off state.
- **`signUpUrl()` (`apps/app/lib/site-links.ts`) reads it on the server** and
  hands a plain string to the client component. Declared in `apps/app/turbo.json`
  `passThroughEnv`. The API does not read it.

On the hosted stack itself (`RELOOP_REGISTRY_URL` set, `IS_MARKETING` unset)
`/get-started` is reachable without a session, so a stranger can register. No
other marketing page opens there.

With `RELOOP_CLOUD_URL` set, `sitemap.xml` and `llms.txt` leave `/get-started`
out, because the page only redirects.

## `RELOOP_SITE_URL`, unset by default

The other direction: the address of the marketing site, set on the hosted Cloud.
The Cloud serves `/get-started` and `/docs` inside the landing shell, and the
shell links to pricing, about, privacy and the reading pages. Those pages answer
404 on the Cloud, because `IS_MARKETING` is off there. With `RELOOP_SITE_URL` set,
every link to a marketing page becomes `<RELOOP_SITE_URL>/<page>`, including
"Change plan" on the sign-up form, and the logo on sign-in, sign-up,
onboarding and grant-access. Docs and sign-in stay here.

- **Unset or empty means off**: the links stay relative. The compose file passes
  `${RELOOP_SITE_URL:-}`.
- **`marketingUrl()` (`apps/app/lib/site-links.ts`) reads it on the server** and
  hands a plain string to a client component. Declared in `apps/app/turbo.json`
  `passThroughEnv`. The API does not read it.

## `RELOOP_MARKETING_HOST`, unset by default

The hosted Cloud serves the marketing site itself, on a second host name. A
comma separated list of host names, `reloopcrm.com,www.reloopcrm.com`. A request
whose `Host` (or `X-Forwarded-Host`) is on the list gets the public pages exactly
as `IS_MARKETING="true"` does: the landing page at `/`, pricing, about, docs, the
reading pages, `llms.txt` and the sitemap. Every other host is the app as before.

- **`/sign-in` and `/get-started` on that host redirect to `RELOOP_CLOUD_URL`**,
  with the query, so `?plan=` survives. Without `RELOOP_CLOUD_URL` they render
  here.
- **An app link on that host redirects to `RELOOP_CLOUD_URL` too**, with the same
  path, so a rep who types `reloopcrm.com/companies` lands in the Cloud. A page
  nobody serves is a 404.
- **`siteAddress()` prefers `RELOOP_SITE_URL`** when it is set, so canonical
  links, the sitemap, `robots.txt`, `llms.txt` and the structured data name the
  marketing address and not the app's.
- **Only the app reads it**: `isMarketingHost()` (`apps/app/lib/env.ts`) in the
  proxy, per request. Declared in `apps/app/turbo.json` `passThroughEnv` and
  passed by `deploy/cloud/docker-compose.cloud.yml`.

## `RELOOP_OPERATOR_TENANT`, unset by default

The operator's own workspace inside the hosted Cloud, a tenant id. Exactly that
one tenant runs as a self-hosted install does, every other tenant keeps the
hosted rules. `isOperatorTenant()` and `isHostedCustomer()`
(`@crm/db/tenant-context`) are the two predicates; a gate that expresses a
customer rule reads `isHostedCustomer()`, a gate that expresses infrastructure
(the registry, the tenant cookie, the loops) keeps `isHosted()`.

- **No plan.** `planIdOf` answers `null`, so `NO_PLAN` applies: no contact,
  mailbox, import or monthly limit, no add-ons, no included AI. The registry row
  holds `TENANCY.operator.plan` (`none`), which the trial sweep never matches.
- **The model choice, the ChatGPT subscription and the operator's
  `OPENROUTER_API_KEY`** work as on a self-hosted install: `assertChatgptOffered`
  and `openrouterEnvKey` in `SettingsService`, `chatgptLoginExists` and
  `openrouterKeyOf` in the agent. The agent's `/internal/crm/chatgpt-login` route
  runs under the operator tenant, because the API refuses every other tenant
  before it calls; without an operator tenant it answers `unavailable`.
- **The settings show the self-hosted AI page** instead of Usage, no Plan &
  billing page, the Waitlist page for the owner, and the onboarding offers all
  three AI choices. `hostedCustomer()` and `operatorTenant()`
  (`apps/app/lib/tenant.ts`) read the tenant cookie for that. The Plan card on
  the General page stays a self-host feature: hosted mode hides it for everyone.
- **Billing answers as a self-hosted install** (`configured: false`).
- Declared in `env.validation.ts`, the root `turbo.json`, `apps/app/turbo.json`,
  `apps/agent/turbo.json` and `deploy/cloud/docker-compose.cloud.yml`. The
  import script `apps/api/scripts/import-single-tenant.ts` moves a single-tenant
  database into the Cloud as that tenant; `deploy/cloud/README.md` has the
  runbook.

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
  `process.env.ALLOWED_SIGN_IN` read outside `workspace.ts`. In `apps/app` it
  also refuses `db`, a db-reading `@crm/auth` helper and a db-reading `@crm/db`
  module outside `lib/session.ts`, `lib/mailbox-connection.ts` and the eve
  route: the app renders outside `runAsTenant()`, so every read goes through a
  `cache()`d helper that wraps `inTenant()`.
- **A customer registers through `POST /api/tenant/signup`** and looks their
  workspace up through `POST /api/tenant/lookup` (`apps/api/src/tenancy`). Both
  are open paths in `tenantMiddleware`, rate limited per address and per IP in
  memory (`TENANCY.signup.rate`). Signup provisions the database at once
  (`provisionTenant`, `packages/db/src/provision.ts`: create, migrate, registry
  row, `AppSetting.plan`, all rolled back on failure) with status `pending` and
  the one address in `tenant_sign_in`. Activation is the first Google or
  Microsoft sign-in with that exact address: `TenantActivationHooks` runs on
  session create, sets `active`, and registers the company domain when the
  address is not free mail. With mail on (below) the form also takes a
  password, and a six digit code by mail activates the tenant instead. A
  tenant still `pending` after `TENANCY.signup.pendingTtlMs` (48 hours) is
  removed.
- **`RESEND_API_KEY` and `MAIL_FROM`** turn mail on, both together. `MailService`
  (`apps/api/src/mail`) is the one place that talks to Resend, over its HTTP
  API with `fetch`. `GET /api/tenant/options` tells the sign-up form whether a
  password is offered. The code is six digits, valid 15 minutes, five tries,
  a new one after 60 seconds (`SIGNUP.code`, `apps/api/src/tenancy/tenancy.config.ts`).
  It is stored in the registry table `tenant_code` as an HMAC with
  `BETTER_AUTH_SECRET`, next to the name and the password hash, and the user
  is created in the tenant database only when the code is right
  (`POST /api/tenant/verify`). `POST /api/tenant/reset` and `reset/confirm` are
  "Forgot password" with the same code and the same limits; `reset` answers
  200 whether the address exists or not. `POST /api/tenant/lookup` names
  `"email"` as a sign-in method only when mail is on and that person has a
  password. The mail is plain text plus minimal HTML in the customer's
  language (`mail-copy.ts`, all seven). Password sign-in is always enabled in
  hosted mode; `PASSWORD_SIGN_IN` is for a self-hosted install. With either
  variable unset nothing is sent and sign-up is Google and Microsoft only.
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

## `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, off by default

Billing for the hosted Cloud, through Stripe. Both set turn Settings > Plan &
billing into a shop: a workspace owner or admin chooses a plan, monthly or
yearly, buys add-ons, reads invoices, changes the payment method and the
address, and cancels. Either unset, the page shows the plan with a note that
billing is not set up, and nothing throws. Only read in hosted mode; a
self-hosted install has no plan and never sees the page.

- **`STRIPE_SECRET_KEY`** is the API key, `sk_test_` first. The `stripe`
  package is used in the API only (`apps/api/src/billing`).
- **`STRIPE_WEBHOOK_SECRET`** signs `POST /api/billing/webhook`. The webhook is
  the single source of truth for the plan: on `checkout.session.completed`,
  `customer.subscription.created|updated|deleted`, `invoice.paid` and
  `invoice.payment_failed` the API fetches the subscription from Stripe and
  writes the plan, the paid-until date, the add-on quantities and the billing
  status to the registry (`tenant.plan`, `paid_until`, `grace_until`,
  `billing`) and the plan to `AppSetting.plan`. A wrong signature is a 400. The
  same event twice writes the same state. `customer.subscription.deleted`
  suspends the workspace; the daily sweep deletes it
  `TENANCY.trial.suspendedTtlMs` later, like an ended trial.
- **A failed payment gives `TENANCY.billing.graceMs`** (7 days,
  `packages/db/src/tenancy-config.ts`). `invoice.paid` clears it; the sweep
  suspends a workspace whose grace ended.
- **Add-ons raise the monthly budgets.** `planLimitsOf(db)`
  (`@crm/db/plan-usage`) is the one function every limit reader calls, and it
  applies `currentTenant().billing.addOns` through `withAddOns()`
  (`@crm/db/plans`). `limitsOf(plan)` alone knows no add-ons.
- **Prices are found by lookup key, never by id.** `packages/db/src/pricing.ts`
  holds the net EUR prices and the keys (`reloop:plan:start:month`,
  `reloop:addon:drafts:year`); the landing page reads its numbers from the
  same module. `bun apps/api/scripts/stripe-setup.ts` creates the products,
  the prices (tax exclusive, Stripe Tax code SaaS business use), the customer
  portal configuration and, with `--webhook <url>`, the endpoint, and prints
  the signing secret once. A new subscription is a Stripe Checkout session
  with Stripe Tax, a required billing address and tax id collection; a yearly
  plan is card only. A plan change or an add-on on an existing subscription
  is `subscriptions.update` with an immediate invoice, applied at once and
  again by the webhook. Cancel is `cancel_at_period_end`, undone until then.
- **A paused workspace can still pay.** A suspended tenant (trial ended,
  grace ended, plan ended) passes `tenantMiddleware` only for `/api/auth/*`
  and tRPC batches made of `billing.*` alone; everything else stays 403
  `TENANT_SUSPENDED`. The app's proxy reads that 403 as the `suspended` gate
  and sends every page to `/paused`, a slim page with the reason, the deletion
  date, the plan picker and the portal button. The webhook sets the tenant
  `active` again on the first paid subscription. Members see a note to ask an
  owner.
- **A subscription during the trial keeps the trial.** When the trial ends
  more than `BILLING.checkout.trialLeadMs` (48 hours) from now, Checkout gets
  `subscription_data.trial_end`, so the first charge is at trial end; nearer
  than that it charges now. The picker says which.
- **Still by hand in the Dashboard**: activating Stripe Tax (origin address,
  registrations) and the payment methods offered on monthly plans.

Declared in `env.validation.ts`, the root `turbo.json` and
`deploy/docker-compose.yml`.

## `AGENT_HISTORY_RETENTION_DAYS`, off by default

Empty means nothing is deleted. A positive number makes `pruneAgentHistory`
(`apps/agent/agent/lib/housekeeping.ts`) delete `agentEvent` rows and finished
`agentTask` rows older than that many days, `DISPATCH.retention.batch` rows per
dispatch tick. The record sheet's offline transcript reaches back that far. A
value that is not a positive integer counts as off. Declared in the root and the
agent's `turbo.json`.

## `AGENT_SHARED_KEY_PER_MINUTE`, 300 by default

Hosted mode only. The number of model calls per minute the operator's
`OPENROUTER_API_KEY` carries across every tenant, read by `keyBucket()` in
`apps/agent/agent/lib/key-bucket.ts`. `DISPATCH.bucket` keeps 30 % of it for the
fast lane and shares the rest between the tenants' backfills by plan. A value
that is not a positive integer counts as the default. Declared in the agent's
`turbo.json` and passed to the agent container by `deploy/docker-compose.yml`,
not in the API's schema, because only the agent reads it.

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
| `OPENROUTER_API_KEY` | The model through OpenRouter, when no key was pasted on Settings → AI. A pasted key wins. In hosted mode it is the operator's key for every plan with AI included, and a pasted key is not read |
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

**`MAILBOX_SYNC_MAX_PER_TICK`** (1000), **`MAILBOX_SYNC_BACKFILL_CHUNK`** (500)
and **`MAILBOX_SYNC_PAGE_SIZE`** (200) size one tick per mailbox, all optional,
positive integers, parsed once by `mailboxSyncConfig` in
`apps/api/src/mailbox/mailbox.config.ts`. `MAX_PER_TICK` caps the messages one
tick stores for Outlook and IMAP; Gmail never goes above its API quota share
(`GMAIL_QUOTA`: 6,000 units per user per minute, `messages.get` costs 20, 80 %
used, so 240 per tick), because a tick runs at most once a minute and a higher
number only buys 429s. A lower cap lowers Gmail too. `BACKFILL_CHUNK` is the ids one
Gmail `messages.list` call asks for (its maximum is 500) and the width of one
IMAP `FETCH` range. `PAGE_SIZE` is the Graph `$top` for Outlook, bodies
included: Graph allows 1000, and its own docs warn a page of hundreds of full
bodies can time out with a 504. The forward read keeps its fixed share of 120
and always runs first. The tick budget (30 s per tenant hosted, 60 s otherwise)
and the plan's `importThreads` cap still apply on top, so a bigger number never
runs a tenant past its budget or a trial past 500 threads. Based on the Gmail
API quota page, the Graph `user-list-messages` reference, and the Graph
throttling limits (10,000 requests per mailbox per app per 10 minutes, 4
concurrent) as of September 2026.

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
