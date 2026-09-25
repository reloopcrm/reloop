# Reloop Cloud: hosted deploy

One Postgres database per customer, one API process for all of them. This
folder is an overlay on `deploy/docker-compose.yml`; the self-host file stays
as it is.

```sh
cd deploy
docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml up -d
```

## What the overlay adds

- **`migrate`** runs before `api` starts: `bun scripts/tenant.ts migrate-all`.
  It creates the `reloop_registry` database on first run, then applies the
  Prisma migrations to every tenant database. A tenant whose migration fails is
  marked `migration_failed` and the others continue. `api` waits for the
  service to finish (`service_completed_successfully`).
- **`api`, `app`, `agent`** get `RELOOP_REGISTRY_URL` and
  `RELOOP_TENANT_DATABASE_URL_TEMPLATE`. `api` no longer runs `db:deploy` at
  start, and mounts the `backups` volume as `RELOOP_BACKUP_DIR`.
- **`backup`** (profile `backup`) is a `postgres:17` image with rclone. It is
  run by a cron on the host, not kept running.

## Updating

The cloud install does not enable the `updater` (watchtower) profile: an image
swap by watchtower restarts `api` without running `migrate`. Update with

```sh
docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml pull
docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml up -d
```

which runs `migrate` again before `api` comes back.

## Environment

In `deploy/.env`, next to the self-host values:

| Variable | What it does |
| --- | --- |
| `RELOOP_BACKUP_REMOTE` | rclone remote for the nightly copy, `<remote>:<path>`. Unset: dumps stay on the host, the script warns. |
| `RCLONE_CONFIG_DIR` | Folder with `rclone.conf` for that remote. Default `./rclone` next to the compose file. |

The API reads `RELOOP_BACKUP_DIR` (set by the overlay to `/backups`). See
`docs/environment.md` for the full list.

## How a customer registers

1. `POST /api/tenant/signup` with email, name, company, plan and locale.
   The API creates the database, migrates it, writes the registry row with
   status `pending`, sets the trial (14 days) and answers with the tenant
   cookie. The one address is the only allowed sign-in.
2. The customer signs in with Google or Microsoft using that exact address.
   The first session activates the tenant. A company domain (not free mail)
   is then registered, so colleagues can join.
3. A tenant still `pending` after 48 hours is removed by the daily sweep.

Returning customers use `POST /api/tenant/lookup` with their address.

## Trials, suspension, deletion

The daily sweep runs in-process in production, and also on
`POST /internal/tenants/sweep` with `Authorization: Bearer <CRON_SECRET>`.

- Trial past `trial_ends_at` and no paid plan: status `suspended`. Sign-in
  answers 403 `TENANT_SUSPENDED`. Data is kept.
- Suspended for 30 days: the database is dumped, dropped, and the registry rows
  are deleted.
- The owner deletes the workspace in Settings, General, or on the paused
  page when the workspace is suspended. Status turns `deleted` first, then the
  Stripe subscription is cancelled at once without proration, and the same
  path dumps and drops the database. A Stripe refusal puts the old status
  back. Any later step that fails leaves the status at `deleted`, and the next
  sweep or the next Stripe webhook for that subscription finishes the work.

The `api` image carries `postgresql-client-17` from the PostgreSQL apt
repository, so its `pg_dump` matches the Postgres 17 server and the dump
before a drop is always fresh. When `pg_dump` fails anyway, the sweep uses the
newest nightly dump of that tenant in `/backups` when it is younger than 36
hours. Without such a dump the tenant is kept and an error is logged.

## Nightly backup

Add to the host crontab:

```
0 3 * * * cd /opt/reloop/deploy && docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml run --rm backup >> /var/log/reloop-backup.log 2>&1
```

`backup.sh` dumps the registry and every tenant database with `pg_dump | gzip`
into `daily/`, copies Sunday's files into `weekly/`, keeps 14 daily and 8 weekly
files, then `rclone copy`s the folder to `RELOOP_BACKUP_REMOTE`. A missing
remote or a missing rclone is a warning, never a failure.

The copy never deletes on the remote, so a wiped or compromised host cannot
wipe the off-site dumps with it. Give the remote an account that can write but
not delete (for SFTP: `ForceCommand internal-sftp -P remove,rmdir,rename,symlink,posix-rename`
in a `Match User` block with a `ChrootDirectory`), and prune old dumps with a
job on the remote host itself, for example
`find <dir> -type f -mtime +60 -delete`.
The host keeps a deleted tenant's last dump for 8 weeks (`KEEP_WEEKLY_WEEKS`),
the remote keeps every file for 60 days. The owner is told the longer of the
two, `TENANCY.backup.retentionDays` (60). Change both together.

Restore one tenant:

```sh
docker compose exec -T postgres createdb -U reloop crm_acme
gunzip -c backups/daily/crm_acme-2026-09-21.sql.gz | docker compose exec -T postgres psql -U reloop -d crm_acme
```

A `.dump` file written by the API (`pg_dump --format=custom`) restores with
`pg_restore -d crm_acme file.dump`.

## The tenant CLI

```sh
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts list'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts create acme acme.com --active --plan standard --language de'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts migrate acme'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts migrate-all'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts suspend acme'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts delete acme'
```

`create` without `--active` leaves the tenant `pending` until the first
sign-in. `--language` stores the language the agent writes in (`en`, `de`, `es`,
`fr`, `pt-BR`, `tr`, `zh-Hans`). Without it the tenant gets German when the
Cloud's `RELOOP_GERMAN` is `"true"`, else English. The owner changes it later in
Settings, General. `delete` dumps first (`RELOOP_BACKUP_DIR`, or `--dump-dir`) and refuses
without a dump.

## Moving a single-tenant install into the Cloud as the operator tenant

The operator's own install (one database, its own `BETTER_AUTH_SECRET`, the
marketing site on `IS_MARKETING=true`) becomes one tenant of the Cloud, and the
Cloud serves the marketing site from then on. Nothing is typed in again: the
mailboxes, the stored keys and the ChatGPT login come along. Sessions do not:
everyone signs in again. API keys keep their hash but carry no tenant prefix,
so they are created again in Settings. Stored OAuth app secrets are re-sealed
but not read on the Cloud; the Cloud's own env pairs apply.

Placeholders below: `<old>` is the old stack's folder, `<cloud>` the Cloud's,
`<tenant>` the tenant id (for example `reloop`), `<slug>` the workspace slug.
Both compose files carry `name: reloop`: on one host the two stacks only
coexist when one of them runs under another project name (`-p`), or their
volumes collide. On two hosts, `scp` the dump to the Cloud host first.

1. **Dump the old database**, plain SQL, from the old stack:

   ```sh
   cd <old>/deploy
   docker compose exec -T postgres pg_dump -U reloop -d reloop --format=plain --no-owner --no-privileges > /root/reloop-single.sql
   ```

2. **Copy the dump and the old secret into the Cloud's api container.** The old
   secret goes through the environment, never a flag, never a log:

   ```sh
   cd <cloud>/deploy
   docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml cp /root/reloop-single.sql api:/tmp/reloop-single.sql
   export IMPORT_OLD_SECRET="$(grep ^BETTER_AUTH_SECRET= <old>/deploy/.env | cut -d= -f2- | tr -d '"')"
   export IMPORT_RELOOP_GERMAN="$(grep ^RELOOP_GERMAN= <old>/deploy/.env | cut -d= -f2- | tr -d '"')"
   ```

   The agent language of the new tenant is `--language` when given, else the
   value already stored in the dump, else German when `IMPORT_RELOOP_GERMAN` is
   `"true"`, else English. The report names the result.

3. **Dry run.** Everything happens in `crm_<tenant>_dryrun_test`: restore, the
   Cloud's migrations, the re-sealing of every secret with the Cloud's
   `BETTER_AUTH_SECRET`, the report, then the database is dropped. Read the
   report: every `imapAccount.secret` must say `ok`, and a `failed` line names a
   value the owner enters again after the move.

   ```sh
   docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml exec -e IMPORT_OLD_SECRET -e IMPORT_RELOOP_GERMAN api sh -c 'cd /app/apps/api && bun scripts/import-single-tenant.ts --dump /tmp/reloop-single.sql --tenant <tenant> --slug <slug> --sign-in owner@example.com,example.com --dry-run'
   ```

4. **Real run.** Same command without `--dry-run`. It refuses when the tenant or
   the database already exists. On success the tenant is `active` with plan
   `none`, the sign-in addresses (plus the addresses granted in the old
   install) are registered, and the old tracking site id is registered too.

5. **Name the operator tenant and the marketing host** in `<cloud>/deploy/.env`,
   then restart the stack:

   ```
   RELOOP_OPERATOR_TENANT="<tenant>"
   RELOOP_MARKETING_HOST="reloopcrm.com,www.reloopcrm.com"
   RELOOP_SITE_URL="https://reloopcrm.com"
   RELOOP_CLOUD_URL="https://app.reloopcrm.com"
   ```

   ```sh
   docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml up -d
   ```

6. **Copy the Codex login** (the ChatGPT subscription) from the old agent's
   `CODEX_HOME` volume into the Cloud agent's. Find both names with
   `docker volume ls` (they end in `_codex`), then:

   ```sh
   docker run --rm -v <old-codex-volume>:/from:ro -v <cloud-codex-volume>:/to alpine sh -c 'cp -a /from/. /to/ && chown -R 1000:1000 /to'
   docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml restart agent
   ```

   Across two hosts, pipe a tar through ssh instead:

   ```sh
   docker run --rm -v <old-codex-volume>:/from:ro alpine tar cf - -C /from . | ssh <cloud-host> docker run --rm -i -v <cloud-codex-volume>:/to alpine sh -c 'tar xf - -C /to && chown -R 1000:1000 /to'
   ```

7. **Point the marketing domain at the Cloud app.** In the Cloud's Caddyfile,
   add `reloopcrm.com` and `www.reloopcrm.com` as site addresses with the same
   block as `app.reloopcrm.com`, including every `handle` or `reverse_proxy`
   line that sends `/api/*` to `api:3001`: the tracking script on the public
   site posts to the collector through the marketing host. Reload Caddy, then
   move the DNS records. The Cloud app answers the marketing pages on those
   hosts and sends sign-in to `app.reloopcrm.com`.

8. **Stop the old stack, keep it.** `docker compose stop` in `<old>/deploy`,
   not `down -v`. The old database and volumes stay as the fallback until the
   move has proven itself: to fall back, point the domain at the old server again
   and `docker compose start`.

9. **Sign in** at `app.reloopcrm.com` with the owner's address, check Settings >
   Connections (the five mailboxes), Settings > AI (the ChatGPT login and the
   keys), and create the API keys again.
