#!/bin/sh
set -eu

RELOOP_RAW="${RELOOP_RAW:-https://raw.githubusercontent.com/reloopcrm/reloop/main}"

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
ask() { printf '%s' "$1" > /dev/tty; IFS= read -r REPLY < /dev/tty || REPLY=""; }
restore_tty() { stty echo < /dev/tty 2>/dev/null || true; }

command -v docker > /dev/null 2>&1 || fail "Docker is not installed. Install it from https://docs.docker.com/engine/install/ and run this again."
docker compose version > /dev/null 2>&1 || fail "Docker Compose v2 is missing. Install the docker-compose-plugin package."
docker info > /dev/null 2>&1 || fail "Docker is not running, or this user cannot use it. Start Docker or run as a user in the docker group."
command -v openssl > /dev/null 2>&1 || fail "openssl is not installed."

if [ -f ./install.sh ] && [ -f ./deploy/docker-compose.yml ]; then
	DIR="$(pwd)/deploy"
else
	command -v curl > /dev/null 2>&1 || fail "curl is not installed."
	DIR="${RELOOP_DIR:-$HOME/reloop}/deploy"
	mkdir -p "$DIR"
	for file in docker-compose.yml Caddyfile; do
		if [ ! -f "$DIR/$file" ]; then
			curl -fsSL "$RELOOP_RAW/deploy/$file" -o "$DIR/$file.tmp"
			mv "$DIR/$file.tmp" "$DIR/$file"
		fi
	done
fi

cd "$DIR"
ENV_FILE="$DIR/.env"
CREATE_OWNER=0

if [ -f "$ENV_FILE" ]; then
	say "Found $ENV_FILE. Existing secrets and settings stay as they are."
else
	if docker volume inspect reloop_postgres-data > /dev/null 2>&1; then
		fail "A Reloop database volume exists, but $ENV_FILE is missing. Restore that file from your backup. A new password cannot open the existing database."
	fi

	say "Reloop CRM installer"
	say ""

	ask "Domain for Reloop (for example crm.example.com), or press Enter for localhost: "
	DOMAIN="${REPLY:-localhost}"
	case "$DOMAIN" in
		*[!A-Za-z0-9.-]* | "" | .* | *.) fail "\"$DOMAIN\" is not a domain name. Write it without http:// and without a path." ;;
	esac

	PROFILES=""
	if [ "$DOMAIN" = "localhost" ]; then
		URL="http://localhost:3000"
	else
		URL="https://$DOMAIN"
		ask "Does a reverse proxy already use ports 80 and 443 on this server (nginx, Traefik, Caddy)? [y/N] "
		case "$REPLY" in
			y | Y | yes | YES) PROFILES="" ;;
			*) PROFILES="caddy" ;;
		esac
	fi

	ask "Owner email address: "
	EMAIL="$(printf '%s' "$REPLY" | tr '[:upper:]' '[:lower:]')"
	case "$EMAIL" in
		*[[:space:]]* | *@*@* | @* | *@) fail "\"$EMAIL\" is not an email address." ;;
		*@*) ;;
		*) fail "\"$EMAIL\" is not an email address." ;;
	esac

	trap restore_tty EXIT INT TERM
	stty -echo < /dev/tty
	ask "Owner password (12 to 128 characters): "
	PASSWORD="$REPLY"
	printf '\n' > /dev/tty
	ask "Repeat the password: "
	REPEAT="$REPLY"
	printf '\n' > /dev/tty
	restore_tty
	trap - EXIT INT TERM

	[ "$PASSWORD" = "$REPEAT" ] || fail "The passwords do not match. Nothing was written."
	LENGTH=${#PASSWORD}
	[ "$LENGTH" -ge 12 ] || fail "The password needs at least 12 characters. Nothing was written."
	[ "$LENGTH" -le 128 ] || fail "The password takes at most 128 characters. Nothing was written."

	umask 077
	cat > "$ENV_FILE.tmp" <<EOF
RELOOP_DOMAIN=$DOMAIN
RELOOP_VERSION=latest
COMPOSE_PROFILES=$PROFILES
POSTGRES_PASSWORD=$(openssl rand -hex 32)
APP_URL=$URL
API_URL=$URL
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
AGENT_BRIDGE_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)
ALLOWED_SIGN_IN=$EMAIL
PASSWORD_SIGN_IN=1
EOF
	chmod 600 "$ENV_FILE.tmp"
	mv "$ENV_FILE.tmp" "$ENV_FILE"
	say "Wrote $ENV_FILE."
	CREATE_OWNER=1
fi

say "Pulling images. This takes a few minutes the first time."
docker compose pull
docker compose up -d --wait

if [ "$CREATE_OWNER" = "1" ]; then
	if ! printf '%s' "$PASSWORD" | docker compose exec -T api bun apps/api/scripts/create-owner.ts "$EMAIL"; then
		say "The owner account was not created. Run this command in $DIR to try again:"
		say "  printf '%s' 'your password' | docker compose exec -T api bun apps/api/scripts/create-owner.ts $EMAIL"
		exit 1
	fi
fi

APP_URL_VALUE="$(sed -n 's/^APP_URL=//p' "$ENV_FILE" | head -n 1)"
PROFILE_VALUE="$(sed -n 's/^COMPOSE_PROFILES=//p' "$ENV_FILE" | head -n 1)"

say ""
say "Reloop CRM is running."
say "Open $APP_URL_VALUE and sign in with the owner email and password."
case "$APP_URL_VALUE" in
	https://*)
		if [ "$PROFILE_VALUE" != "caddy" ]; then
			say "Point your reverse proxy for this domain at http://127.0.0.1:3000."
		fi
		;;
esac
say "Settings live in $ENV_FILE. Keep a copy of that file with your backups."
