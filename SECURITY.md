# Security Policy

## Reporting a vulnerability

Please report privately through **Security → Report a vulnerability** on this repository, not in a
public issue.

Include the revision, your configuration, the impact, and the steps to reproduce it. If it involves
real data, describe the shape of it rather than pasting it.

We'll acknowledge within a few working days and tell you what we intend to do. This is a small
project and there is no bounty.

## What this is, and what it assumes

This CRM is built for **one organisation of authenticated internal users**. It is not a hardened
public or multi-tenant service boundary, and the design says so out loud in a few places. The
limits below are real and worth reading before you put customer data in it.

**Sign-in is the entire authorisation model.** `ALLOWED_SIGN_IN` decides who gets in; after that,
every signed-in person can read and write every record. Workspace roles (owner, admin, member) gate
settings and a few admin actions, but there are no per-record permissions and no separate
organizations. If you need someone to see only part of the pipeline, this is the wrong tool today.

An unset `ALLOWED_SIGN_IN` fails closed: nobody can sign in. A list that names a consumer domain
(`gmail.com`) is an open door, which is why single addresses are supported.

An API key from **Settings → API Keys** is a session in a header, so a leaked key reads and writes
every record its owner can, and an expiry is optional. It cannot mint another key or change a
password: `SessionOnlyMiddleware` refuses an `x-api-key` header on `apiKeys.*` and
`settings.setPassword`, and `accessGuard` refuses it on `/api/auth/api-key/*`, `/change-password`
and `/set-password`. Revoke a key on the same page.

**Operators can read everything.** Whoever runs the deployment has the database, the environment
and the logs. Nothing here protects data from the person hosting it.

**The agent reads your mail.** Reading a connected mailbox (IMAP, Google or Microsoft) is what the
CRM is for. The research agent reads message bodies, meeting
attendees and signature blocks belonging to real people who did not sign up for this. It is
deliberately unrestricted on the *read* side and constrained on the *write* and *egress* sides,
see `apps/agent/agent/skills/data-boundaries.md`. If you deploy this, you are the data controller
for those mailboxes.

**Outbound calls send data to third parties.** Each optional key in `.env.example` turns on a
vendor the agent can query, and a query carries whatever it needs to ask the question, typically a
name, an email domain and an employer. With no keys set, nothing leaves your infrastructure except
the mailbox provider you connect. That is the default.

**The sync route is guarded by a shared secret.** `POST /internal/sync/google` is called by a cron,
so it has no session to check; `CRON_SECRET` is the whole guard and the route refuses to run
without it. Treat it like a password.

**OAuth tokens are encrypted at rest.** `account.encryptOAuthTokens` is on, so Better Auth seals
the Google, Microsoft and Slack access and refresh tokens with `BETTER_AUTH_SECRET` before it
writes the column. Every reader opens it with Better Auth's own key. The mailbox sync asks
`auth.api.getAccessToken`. The Slack bot token in `apps/agent/agent/lib/slack-connection.ts` and
the Google revocation in `apps/api/src/mailbox/mailbox-token.service.ts` go through
`openAccountToken` (`packages/auth/src/account-token.ts`), which reads the same flag and the same
secret Better Auth writes with.

A row written before this option was turned on stays readable. `openAccountToken` returns a value
that is not ciphertext unchanged, so an existing connection keeps working with no reconnect. Such a
row becomes ciphertext on its next write: a sign-in, a reconnect or an account link seals both
tokens, and a token refresh seals the new access token. Google does not issue a new refresh token
on a refresh, and the Slack bot token never rotates, so those two stay in plain text until somebody
reconnects the provider. Reconnect Google and Slack after the upgrade if you want every token
sealed.

**The Slack user token is sealed too.** It lives on `SlackWorkspaceGrant`, not on `account`, so the
Better Auth option never reaches it. `packages/auth/src/slack-grant.ts` seals it with
`sealSlackUserToken` (`@crm/db/slack-inventory`), which is the module that already seals the IMAP
password, keyed on `BETTER_AUTH_SECRET`. A grant written before this shipped keeps working: a
sealed value starts with a version marker, so `readSlackUserToken` recognises a plain one, returns
it, and seals it in place on that first read. A token it cannot open removes the capability to
invite the bot to a private channel and leaves the rest of Slack working.

What encryption does not do is protect the running deployment, which holds the key. Keep the
database off the public internet, and treat a database backup taken before the upgrade as a set of
live mailbox credentials.

**Session cookies depend on one shared value.** The API and the web app both verify sessions
against `BETTER_AUTH_SECRET`. Rotating it signs everyone out, which is the intended way to revoke
every session at once. It also makes every sealed OAuth token and every sealed IMAP password
unreadable, so a rotation means every connection is reconnected by hand.

## Deploying it safely

- Set `ALLOWED_SIGN_IN` to a domain you control. Never a public mail provider.
- Generate `BETTER_AUTH_SECRET` yourself (`openssl rand -base64 32`). The value in any example file
  is not a secret.
- Serve both processes over HTTPS. Secure cookies switch on with `NODE_ENV=production`.
- Set `CRON_SECRET` if you expose the sync route at all.
- Keep the database off the public internet.
- Start with no optional API keys and add them one at a time, so you know what is leaving.

## Supported versions

`main` is the only supported branch. There are no backports.

## Dependencies

Dependencies are updated deliberately rather than automatically. If you spot a vulnerable
transitive dependency, report it the same way as anything else. A PR bumping it is welcome, but
tell us what the exposure is, since a CVE in a dev-only tool and one in the request path deserve
different urgency.
