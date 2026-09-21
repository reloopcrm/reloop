#!/bin/sh
set -eu

: "${PGHOST:=postgres}"
: "${PGUSER:=reloop}"
: "${REGISTRY_DB:=reloop_registry}"
: "${BACKUP_DIR:=/backups}"
: "${KEEP_DAILY_DAYS:=14}"
: "${KEEP_WEEKLY_WEEKS:=8}"

export PGHOST PGUSER

today=$(date -u +%F)
weekday=$(date -u +%u)
daily="$BACKUP_DIR/daily"
weekly="$BACKUP_DIR/weekly"
mkdir -p "$daily" "$weekly"

databases=$(psql -d "$REGISTRY_DB" -Atc "SELECT db_name FROM tenant WHERE deleted_at IS NULL ORDER BY db_name")
databases="$REGISTRY_DB
$databases"

failed=0
for db in $databases; do
	[ -n "$db" ] || continue
	file="$daily/$db-$today.sql.gz"
	if pg_dump --no-owner "$db" | gzip >"$file.tmp"; then
		mv "$file.tmp" "$file"
		echo "dumped $db -> $file"
		if [ "$weekday" = "7" ]; then
			cp "$file" "$weekly/"
		fi
	else
		rm -f "$file.tmp"
		echo "WARNING: pg_dump failed for $db" >&2
		failed=$((failed + 1))
	fi
done

find "$daily" -name '*.sql.gz' -mtime "+$KEEP_DAILY_DAYS" -delete
find "$weekly" -name '*.sql.gz' -mtime "+$((KEEP_WEEKLY_WEEKS * 7))" -delete

if [ -z "${RELOOP_BACKUP_REMOTE:-}" ]; then
	echo "WARNING: RELOOP_BACKUP_REMOTE is not set. The dumps stay on this host only." >&2
elif ! command -v rclone >/dev/null 2>&1; then
	echo "WARNING: rclone is not installed. The dumps stay on this host only." >&2
elif ! rclone sync "$BACKUP_DIR" "$RELOOP_BACKUP_REMOTE"; then
	echo "WARNING: rclone sync to $RELOOP_BACKUP_REMOTE failed. The dumps stay on this host only." >&2
else
	echo "synced $BACKUP_DIR -> $RELOOP_BACKUP_REMOTE"
fi

echo "backup finished, $failed failed"
[ "$failed" -eq 0 ]
