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

**OAuth refresh tokens are stored in plain text.** The `account` table keeps the Google, Microsoft
and Slack access and refresh tokens as they arrive. IMAP passwords are sealed, these are not.
Whoever reads the database reads the mailbox. Better Auth can encrypt them with
`account.encryptOAuthTokens`, and the CRM leaves that option off on purpose: two places read the
column with Prisma instead of through Better Auth, so the ciphertext would reach the vendor as a
token. `apps/agent/agent/lib/slack-connection.ts` sends `account.accessToken` to Slack, and
`revokeWithGoogle` in `apps/api/src/mailbox/mailbox-token.service.ts` sends `account.refreshToken`
to Google. Turning the option on stops Slack agent actions and stops the Google disconnect button
after the next token write. Both readers must go through Better Auth before the option is safe.
Keep the database off the public internet, and treat a database backup as a set of live mailbox
credentials.

**Session cookies depend on one shared value.** The API and the web app both verify sessions
against `BETTER_AUTH_SECRET`. Rotating it signs everyone out, which is the intended way to revoke
every session at once.

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
