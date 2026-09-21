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

The `api` image has no `pg_dump`. The sweep therefore uses the newest nightly
dump of that tenant in `/backups` when it is younger than 36 hours. Without such
a dump the tenant is kept and an error is logged. Keep the nightly backup
running and deletion works on its own.

## Nightly backup

Add to the host crontab:

```
0 3 * * * cd /opt/reloop/deploy && docker compose -f docker-compose.yml -f cloud/docker-compose.cloud.yml run --rm backup >> /var/log/reloop-backup.log 2>&1
```

`backup.sh` dumps the registry and every tenant database with `pg_dump | gzip`
into `daily/`, copies Sunday's files into `weekly/`, keeps 14 daily and 8 weekly
files, then `rclone sync`s the folder to `RELOOP_BACKUP_REMOTE`. A missing
remote or a missing rclone is a warning, never a failure.

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
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts create acme acme.com --active --plan standard'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts migrate acme'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts migrate-all'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts suspend acme'
docker compose exec api sh -c 'cd /app/apps/api && bun scripts/tenant.ts delete acme'
```

`create` without `--active` leaves the tenant `pending` until the first
sign-in. `delete` dumps first (`RELOOP_BACKUP_DIR`, or `--dump-dir`) and refuses
without a dump.
