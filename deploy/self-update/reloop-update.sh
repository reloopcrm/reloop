#!/bin/sh

set -eu

UPDATE_REPO="https://github.com/reloopcrm/reloop.git"
UPDATE_REF="latest-tag"
UPDATE_HOME="/opt/reloop"
UPDATE_BACKUP_DIR="/root/backups/reloop"
UPDATE_POSTGRES_CONTAINER="reloop-postgres"
UPDATE_POSTGRES_USER="reloop"
UPDATE_POSTGRES_DB="crm"
UPDATE_APP_URL="http://127.0.0.1:3000"
UPDATE_API_URL="http://127.0.0.1:3001"
UPDATE_HEALTH_TIMEOUT=180
UPDATE_LOG="/var/log/reloop-update.log"
UPDATE_LOCK="/run/lock/reloop-update"
UPDATE_EXTRA_PATH="/root/.bun/bin:/usr/local/bin"

CONFIG_FILE="${RELOOP_UPDATE_CONFIG:-/etc/reloop-update.conf}"
if [ -f "$CONFIG_FILE" ]; then
	. "$CONFIG_FILE"
fi

PATH="$UPDATE_EXTRA_PATH:$PATH"
export PATH
export TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1

LIVE="$UPDATE_HOME/app"
RELEASES="$UPDATE_HOME/releases"
SERVICES="reloop-api reloop-app reloop-agent"

INSTALLED_VERSION=""
TARGET_REF=""
RELEASE_NAME=""
NEW=""
PREVIOUS=""

log() {
	printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$UPDATE_LOG"
}

fail() {
	log "ERROR: $*"
	exit 1
}

check_requirements() {
	[ "$(id -u)" -eq 0 ] || fail "Run this script as root. It restarts services and writes to $UPDATE_BACKUP_DIR."
	touch "$UPDATE_LOG" || fail "Cannot write the log file $UPDATE_LOG."
	for command in git curl gzip docker systemctl bun node; do
		command -v "$command" >/dev/null 2>&1 || fail "Command not found: $command. Install it or extend UPDATE_EXTRA_PATH in $CONFIG_FILE."
	done
	[ -d "$UPDATE_BACKUP_DIR" ] || fail "Backup folder $UPDATE_BACKUP_DIR does not exist."
	[ -f "$LIVE/package.json" ] || fail "Live install $LIVE has no package.json."
	[ -f "$LIVE/.env" ] || fail "Live install $LIVE has no .env."
}

take_lock() {
	if mkdir "$UPDATE_LOCK" 2>/dev/null; then
		printf '%s\n' "$$" >"$UPDATE_LOCK/pid"
		return 0
	fi
	old_pid=$(cat "$UPDATE_LOCK/pid" 2>/dev/null || true)
	if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
		log "Another update runs already as pid $old_pid. Nothing to do."
		exit 0
	fi
	log "Removing a stale lock left by pid ${old_pid:-unknown}."
	rm -rf "$UPDATE_LOCK"
	mkdir "$UPDATE_LOCK" || fail "Cannot take the lock $UPDATE_LOCK."
	printf '%s\n' "$$" >"$UPDATE_LOCK/pid"
}

release_lock() {
	rm -rf "$UPDATE_LOCK"
}

on_exit() {
	status=$?
	release_lock
	if [ "$status" -ne 0 ]; then
		log "Update stopped with status $status. The full output is in $UPDATE_LOG."
	fi
}

sort_versions() {
	sort -t . -k 1,1n -k 2,2n -k 3,3n
}

is_newer() {
	highest=$(printf '%s\n%s\n' "$1" "$2" | sort_versions | tail -n 1)
	[ "$1" != "$2" ] && [ "$highest" = "$1" ]
}

installed_version() {
	sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$LIVE/package.json" | head -n 1
}

newest_tag_version() {
	git ls-remote --tags --refs "$UPDATE_REPO" 'v*' 2>>"$UPDATE_LOG" |
		sed -n 's|^[0-9a-f]*[[:space:]]*refs/tags/v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$|\1|p' |
		sort_versions |
		tail -n 1
}

branch_commit() {
	git ls-remote --heads "$UPDATE_REPO" "$1" 2>>"$UPDATE_LOG" | cut -f 1
}

decide_target() {
	INSTALLED_VERSION=$(installed_version)
	[ -n "$INSTALLED_VERSION" ] || fail "Cannot read the version from $LIVE/package.json."

	case "$UPDATE_REF" in
	latest-tag)
		target_version=$(newest_tag_version)
		[ -n "$target_version" ] || fail "No tag like vX.Y.Z found in $UPDATE_REPO. Is the network up?"
		TARGET_REF="v$target_version"
		;;
	v[0-9]*)
		target_version="${UPDATE_REF#v}"
		TARGET_REF="$UPDATE_REF"
		;;
	*)
		commit=$(branch_commit "$UPDATE_REF")
		[ -n "$commit" ] || fail "Branch $UPDATE_REF not found in $UPDATE_REPO. Is the network up?"
		installed_commit=$(cat "$LIVE/.reloop-commit" 2>/dev/null || true)
		if [ "$commit" = "$installed_commit" ]; then
			log "Installed commit $installed_commit is the newest on branch $UPDATE_REF. Nothing to do."
			exit 0
		fi
		TARGET_REF="$UPDATE_REF"
		RELEASE_NAME="$(printf '%s' "$UPDATE_REF" | tr '/' '-')-$(printf '%.7s' "$commit")"
		return 0
		;;
	esac

	if [ "$target_version" = "$INSTALLED_VERSION" ]; then
		log "Installed version $INSTALLED_VERSION is the newest release. Nothing to do."
		exit 0
	fi
	if ! is_newer "$target_version" "$INSTALLED_VERSION"; then
		log "Installed version $INSTALLED_VERSION is newer than $TARGET_REF. Nothing to do."
		exit 0
	fi
	RELEASE_NAME="$TARGET_REF"
}

refuse_known_failure() {
	marker="$RELEASES/$RELEASE_NAME.failed"
	if [ -e "$marker" ]; then
		fail "Release $RELEASE_NAME failed its health check earlier. Delete $marker to try again."
	fi
}

dump_database() {
	dump="$UPDATE_BACKUP_DIR/crm-before-$RELEASE_NAME.sql.gz"
	if [ -e "$dump" ]; then
		dump="$UPDATE_BACKUP_DIR/crm-before-$RELEASE_NAME-$(date '+%Y%m%d-%H%M%S').sql.gz"
	fi
	work="$UPDATE_BACKUP_DIR/crm-before-$RELEASE_NAME.part"
	rm -f "$work.sql" "$work.sql.gz"

	log "Dumping database $UPDATE_POSTGRES_DB from container $UPDATE_POSTGRES_CONTAINER to $dump"
	if ! docker exec "$UPDATE_POSTGRES_CONTAINER" pg_dump -U "$UPDATE_POSTGRES_USER" "$UPDATE_POSTGRES_DB" >"$work.sql" 2>>"$UPDATE_LOG"; then
		rm -f "$work.sql"
		fail "pg_dump failed. No update without a dump."
	fi
	grep -q 'PostgreSQL database dump' "$work.sql" || fail "The dump $work.sql does not look like a pg_dump file."
	gzip "$work.sql" || fail "gzip of the dump failed."
	gzip -t "$work.sql.gz" || fail "The dump $work.sql.gz is not a valid gzip file."
	mv "$work.sql.gz" "$dump"
	log "Dump written and verified: $dump ($(du -h "$dump" | cut -f 1))"
}

fetch_source() {
	NEW="$RELEASES/$RELEASE_NAME"
	mkdir -p "$RELEASES"
	if [ -e "$NEW" ]; then
		[ "$(real_path "$NEW")" != "$(real_path "$LIVE")" ] || fail "$NEW is the live install. Nothing was changed."
		log "Removing the unfinished work tree $NEW"
		rm -rf "$NEW"
	fi
	log "Fetching $TARGET_REF from $UPDATE_REPO into $NEW"
	git clone --quiet --depth 1 --branch "$TARGET_REF" "$UPDATE_REPO" "$NEW" >>"$UPDATE_LOG" 2>&1 || fail "git clone of $TARGET_REF failed."
	NEW=$(real_path "$NEW")
	git -C "$NEW" rev-parse HEAD >"$NEW/.reloop-commit"
	cp -p "$LIVE/.env" "$NEW/.env"
	chmod 600 "$NEW/.env"
	if [ -f "$LIVE/.env.local" ]; then
		cp -p "$LIVE/.env.local" "$NEW/.env.local"
		chmod 600 "$NEW/.env.local"
	fi
}

load_env_file() {
	while IFS= read -r line || [ -n "$line" ]; do
		case "$line" in
		'' | '#'*) continue ;;
		*=*) ;;
		*) continue ;;
		esac
		key=${line%%=*}
		value=${line#*=}
		key=$(printf '%s' "$key" | sed 's/^export[[:space:]]*//; s/[[:space:]]//g')
		case "$key" in
		'' | *[!A-Za-z0-9_]*) continue ;;
		esac
		case "$value" in
		\"*\")
			value=${value#\"}
			value=${value%\"}
			;;
		\'*\')
			value=${value#\'}
			value=${value%\'}
			;;
		esac
		export "$key=$value"
	done <"$1"
}

run_in_release() {
	directory="$1"
	shift
	log "Running in $directory: $*"
	(
		cd "$directory"
		load_env_file "$NEW/.env"
		if [ -f "$NEW/.env.local" ]; then load_env_file "$NEW/.env.local"; fi
		"$@"
	) >>"$UPDATE_LOG" 2>&1 || fail "Step failed: $* (in $directory). Nothing was switched. The output is in $UPDATE_LOG."
}

build_release() {
	run_in_release "$NEW" bun install --frozen-lockfile
	run_in_release "$NEW/packages/db" bun run db:generate
	run_in_release "$NEW/packages/db" bun run db:deploy
	run_in_release "$NEW" bun run build
	log "All builds succeeded in $NEW"
}

real_path() {
	(cd "$1" && pwd -P)
}

point_live_at() {
	[ -L "$LIVE" ] || fail "$LIVE is not a symbolic link. Nothing was changed."
	rm -f "$LIVE"
	ln -s "$1" "$LIVE" || fail "Cannot create the link $LIVE. Create it by hand: ln -s $1 $LIVE"
}

activate_release() {
	PREVIOUS=$(real_path "$LIVE")
	if [ ! -L "$LIVE" ]; then
		moved="$RELEASES/v$INSTALLED_VERSION"
		[ -e "$moved" ] && fail "Cannot move $LIVE to $moved: that folder exists already. Nothing was changed."
	fi
	log "Stopping the agent"
	systemctl stop reloop-agent
	if [ -L "$LIVE" ]; then
		log "Switching $LIVE from $PREVIOUS to $NEW"
		point_live_at "$NEW"
	else
		log "First run: moving the folder $LIVE to $moved and switching $LIVE to $NEW"
		systemctl stop reloop-app reloop-api
		mv "$LIVE" "$moved"
		PREVIOUS=$(real_path "$moved")
		ln -s "$NEW" "$LIVE"
	fi
	log "Restarting $SERVICES"
	systemctl restart reloop-api reloop-app
	systemctl start reloop-agent
}

http_status() {
	curl -s -o /dev/null -m 10 -w '%{http_code}' "$1" || true
}

wait_healthy() {
	waited=0
	app_status=000
	api_status=000
	while [ "$waited" -lt "$UPDATE_HEALTH_TIMEOUT" ]; do
		app_status=$(http_status "$UPDATE_APP_URL/sign-in")
		api_status=$(http_status "$UPDATE_API_URL/health")
		if [ "$app_status" = 200 ] && [ "$api_status" = 200 ]; then
			log "Healthy after ${waited}s: app /sign-in $app_status, api /health $api_status"
			return 0
		fi
		sleep 5
		waited=$((waited + 5))
	done
	log "Not healthy after ${UPDATE_HEALTH_TIMEOUT}s: app /sign-in $app_status, api /health $api_status"
	return 1
}

roll_back() {
	log "Switching $LIVE back to $PREVIOUS"
	systemctl stop reloop-agent || true
	point_live_at "$PREVIOUS"
	systemctl restart reloop-api reloop-app || true
	systemctl start reloop-agent || true
	touch "$RELEASES/$RELEASE_NAME.failed"
	if wait_healthy; then
		log "The previous release $PREVIOUS answers again."
	else
		log "ERROR: the previous release $PREVIOUS does not answer either. Check the services by hand: systemctl status $SERVICES"
	fi
	fail "Update to $RELEASE_NAME failed and was rolled back. The database keeps the new migrations. The dump is in $UPDATE_BACKUP_DIR. Delete $RELEASES/$RELEASE_NAME.failed to try again."
}

remove_old_releases() {
	for directory in "$RELEASES"/*; do
		[ -d "$directory" ] || continue
		case "$(real_path "$directory")" in
		"$NEW" | "$PREVIOUS") continue ;;
		esac
		log "Removing the old release $directory"
		rm -rf "$directory" "$directory.failed"
	done
}

main() {
	check_requirements
	take_lock
	trap on_exit EXIT
	decide_target
	refuse_known_failure
	log "Update from $INSTALLED_VERSION to $RELEASE_NAME starts"
	dump_database
	fetch_source
	build_release
	activate_release
	wait_healthy || roll_back
	if ! systemctl is-active --quiet reloop-agent; then
		log "WARNING: reloop-agent is not active. Check it: systemctl status reloop-agent"
	fi
	remove_old_releases
	log "Update to $RELEASE_NAME done. $LIVE now points to $NEW"
}

main "$@"
