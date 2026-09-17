# Self-update for a source install

`reloop-update.sh` updates a Reloop CRM install that runs from source under
systemd. It runs on the server itself and needs nothing from your workstation. A
systemd timer runs it every 15 minutes.

The Docker install does not need this. It updates with `docker compose pull`,
see [docs/self-host.md](../../docs/self-host.md).

## What it does

One run, in this order:

1. Reads `/etc/reloop-update.conf`. Without the file the defaults in the script
   apply.
2. Asks GitHub for the newest tag that looks like `vX.Y.Z` and compares it with
   the version in `/opt/reloop/app/package.json`. Same version or an older tag:
   one log line, exit 0.
3. Dumps the database through `docker exec <container> pg_dump` into
   `/root/backups/reloop/crm-before-<tag>.sql.gz` and checks it with `gzip -t`.
   A failed dump stops the run. An existing file with that name is kept and the
   new dump gets a timestamp suffix.
4. Clones the tag into `/opt/reloop/releases/<tag>`. Copies `.env` (and
   `.env.local` when present) from the live install into the new folder.
5. Runs `bun install --frozen-lockfile`, `bun run db:generate`, `bun run
   db:deploy` and `bun run build` in the new folder. Any failure stops the run
   before anything is switched.
6. Stops `reloop-agent`, points `/opt/reloop/app` at the new folder, restarts
   `reloop-api` and `reloop-app`, starts `reloop-agent`.
7. Waits until the app answers 200 on `/sign-in` and the API answers 200 on
   `/health`, for at most `UPDATE_HEALTH_TIMEOUT` seconds. On failure it points
   `/opt/reloop/app` back at the previous folder, restarts the services, writes
   `/opt/reloop/releases/<tag>.failed` and exits 1.
8. Removes older release folders. It keeps the new one and the previous one.

Every step goes to `/var/log/reloop-update.log` with a timestamp. Build output
goes there too. A lock in `/run/lock/reloop-update` stops two runs at the same
time.

The script never changes `.env`, never deletes a dump, and never deletes the
folder that `/opt/reloop/app` points at. It does delete release folders older
than the previous one. Those hold code and build output only.

## Layout

```
/opt/reloop/app -> /opt/reloop/releases/v0.8.0
/opt/reloop/releases/v0.7.1
/opt/reloop/releases/v0.8.0
```

`/opt/reloop/app` is a symbolic link. The systemd units keep their
`WorkingDirectory=/opt/reloop/app`, so nothing changes for them. Each release
folder is built at its final path. This matters: the agent build writes its
absolute folder path into `apps/agent/.output`, so a folder that moves after the
build does not start.

The first run converts an install where `/opt/reloop/app` is still a normal
folder. It stops the three services, moves the folder to
`/opt/reloop/releases/v<installed version>`, creates the link to the new
release and starts the services. That is the only run that stops the API and the
app before the switch.

## Install

On the server, as root. The files are in the release under
`deploy/self-update`, or copy them from your workstation with `scp`.

```sh
cd /opt/reloop/app/deploy/self-update
install -m 755 reloop-update.sh /usr/local/bin/reloop-update
install -m 644 reloop-update.conf /etc/reloop-update.conf
install -m 644 reloop-update.service reloop-update.timer /etc/systemd/system/
```

Open `/etc/reloop-update.conf` and check every value. `UPDATE_POSTGRES_USER`
and `UPDATE_POSTGRES_DB` must match what your `backup.sh` passes to `pg_dump`.
`UPDATE_APP_URL` and `UPDATE_API_URL` are the local addresses the services
listen on.

Run it once by hand and read the output:

```sh
reloop-update
```

Then enable the timer:

```sh
systemctl daemon-reload
systemctl enable --now reloop-update.timer
systemctl list-timers reloop-update.timer
```

The timer fires 5 minutes after boot and then 15 minutes after each start of
the service, plus a random delay of up to 5 minutes. A run that takes longer
than 15 minutes is followed by one more run right away, which finds nothing to
do. `systemctl start reloop-update.timer` on a
running server counts as "after boot", so the first check happens within a few
minutes.

`bun run` from the timer needs `bun` and `node` on the path. The service unit
sets `PATH=/root/.bun/bin:/usr/local/bin:/usr/bin:/bin`. Change it there when
your binaries live elsewhere, and set `UPDATE_EXTRA_PATH` in the config for
runs by hand.

Set `RELOOP_MANAGED="true"` in `/opt/reloop/app/.env` so the Settings page
shows the version without an Update button. Without it the app offers a Docker
update command that does not apply to a source install.

## Watch it

```sh
tail -f /var/log/reloop-update.log
systemctl status reloop-update.service
journalctl -u reloop-update.service -n 50
```

## Switch it off

```sh
systemctl disable --now reloop-update.timer
```

The script and the config stay in place. `reloop-update` still works by hand.
To pin one version instead, set `UPDATE_REF="v0.8.0"` in the config. To follow a
branch, set `UPDATE_REF="main"`. A branch is compared by commit, and the release
folder is named `<branch>-<short commit>`.

## Roll back by hand

The previous release stays on disk. Point the link at it and restart:

```sh
ls -la /opt/reloop/app /opt/reloop/releases
systemctl stop reloop-agent
ln -sfn /opt/reloop/releases/v0.7.1 /opt/reloop/app
systemctl restart reloop-api reloop-app
systemctl start reloop-agent
```

Rolling back the code does not roll back the database. `db:deploy` already ran.
Reloop migrations add columns and tables and rarely remove them, so the previous
release normally runs on the newer schema. When it does not, restore the dump.
The dump is a plain `pg_dump` without DROP statements, so the schema must be
empty first:

```sh
systemctl stop reloop-agent reloop-app reloop-api
docker exec reloop-postgres psql -U reloop -d reloop -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gunzip -c /root/backups/reloop/crm-before-v0.8.0.sql.gz | docker exec -i reloop-postgres psql -U reloop -d reloop
systemctl start reloop-api reloop-app reloop-agent
```

Restoring removes every row written since the dump. Read the dump time in the
file name and in the log before you do this.

After a rollback, remove the `.failed` marker only when you want the script to
try that tag again:

```sh
rm /opt/reloop/releases/v0.8.0.failed
```

Without the marker the timer tries the same tag again on its next run, with a
new dump and a full rebuild each time. With the marker it logs an error every
15 minutes until a newer tag exists.

## Run by hand

```sh
reloop-update
```

The exit code is 0 for "nothing to do" and for a finished update, and 1 for
every stop. The last lines of `/var/log/reloop-update.log` say why.

A stale lock after a hard reset is removed by the next run when its process id
is gone. `/run` is cleared at boot in any case.

## Warning

An automatic update carries a broken release into production without a person
looking at it. The dump and the health check are the safety net, not a
guarantee:

- The health check sees only `/sign-in` and `/health`. A release that starts
  and then fails on one page, one mailbox sync or one agent task passes it.
- The agent is not part of the health check. The script warns when
  `reloop-agent` is not active after the switch and does not roll back for it.
- A rollback keeps the new database schema.
- The build runs on the production server. On a small server it takes a long
  time and slows the live app while it runs. The service unit runs it with
  `Nice=10`.
- Three release folders exist for a moment: the live one, the previous one and
  the one being built. Keep enough free disk for that.

Read the changelog of a release before you rely on it, or pin `UPDATE_REF` and
raise it yourself.
