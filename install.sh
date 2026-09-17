#!/bin/sh
set -eu

RELOOP_RAW="${RELOOP_RAW:-https://raw.githubusercontent.com/reloopcrm/reloop/main}"

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
ask() { printf '%s' "$1" > /dev/tty; IFS= read -r REPLY < /dev/tty || REPLY=""; }
restore_tty() { stty echo < /dev/tty 2>/dev/null || true; }

sudo_if_needed() {
	if [ "$(id -u)" = "0" ]; then
		"$@"
	elif command -v sudo > /dev/null 2>&1; then
		sudo "$@"
	else
		return 1
	fi
}

wait_for_docker() {
	i=0
	while [ "$i" -lt 60 ]; do
		docker info > /dev/null 2>&1 && return 0
		i=$((i + 1))
		sleep 2
	done
	return 1
}

install_docker_linux() {
	say "Docker is missing. Installing it now."
	command -v curl > /dev/null 2>&1 || fail "curl is not installed, so Docker cannot be installed automatically."
	curl -fsSL https://get.docker.com -o /tmp/reloop-get-docker.sh || fail "Could not download the Docker installer."
	sudo_if_needed sh /tmp/reloop-get-docker.sh || fail "Docker could not be installed. Run this script as root, or install Docker yourself: https://docs.docker.com/engine/install/"
	rm -f /tmp/reloop-get-docker.sh
	sudo_if_needed systemctl enable --now docker > /dev/null 2>&1 || true
}

start_docker_mac() {
	if [ -d /Applications/OrbStack.app ]; then
		say "Starting OrbStack."
		open -a OrbStack
	elif [ -d /Applications/Docker.app ]; then
		say "Starting Docker Desktop."
		open -a Docker
	elif command -v brew > /dev/null 2>&1; then
		say "Docker is missing. Installing OrbStack now."
		brew install --cask orbstack || fail "OrbStack could not be installed. Install Docker yourself: https://orbstack.dev"
		open -a OrbStack
	else
		fail "Docker is missing. Install OrbStack from https://orbstack.dev or Docker Desktop, then run this again."
	fi
}

ensure_docker() {
	if command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1; then
		return 0
	fi

	case "$(uname -s)" in
		Linux)
			command -v docker > /dev/null 2>&1 || install_docker_linux
			docker info > /dev/null 2>&1 || sudo_if_needed systemctl start docker > /dev/null 2>&1 || true
			;;
		Darwin) start_docker_mac ;;
		*) fail "This installer supports Linux servers and macOS. Install Docker yourself and run it again." ;;
	esac

	say "Waiting for Docker to start."
	wait_for_docker || fail "Docker still does not answer. Start it and run this script again."
}

ensure_docker
docker compose version > /dev/null 2>&1 || fail "Docker Compose v2 is missing. Install the docker-compose-plugin package."
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
		fail "A Reloop database volume exists on this machine, but $ENV_FILE is missing. Run this script in the folder of that installation, or restore $ENV_FILE from your backup. A new password cannot open the existing database."
	fi

	say "Reloop CRM installer"
	say ""

	DOMAIN="${RELOOP_DOMAIN:-}"
	if [ -z "$DOMAIN" ]; then
		ask "Domain for Reloop (for example crm.example.com), or press Enter for localhost: "
		DOMAIN="${REPLY:-localhost}"
	fi
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

	if [ -n "${RELOOP_EMAIL:-}" ]; then
		REPLY="$RELOOP_EMAIL"
	else
		say "Tip: on a German Mac keyboard @ is Option+L. If your terminal sends Option as Meta, paste the address instead of typing it."
		ask "Owner email address: "
	fi
	EMAIL="$(printf '%s' "$REPLY" | tr '[:upper:]' '[:lower:]')"
	case "$EMAIL" in
		*[[:space:]]* | *@*@* | @* | *@) fail "\"$EMAIL\" is not an email address." ;;
		*@*) ;;
		*) fail "\"$EMAIL\" is not an email address." ;;
	esac

	if [ -n "${RELOOP_PASSWORD:-}" ]; then
		PASSWORD="$RELOOP_PASSWORD"
		REPEAT="$RELOOP_PASSWORD"
	else
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
	fi

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
UPDATER_TOKEN=$(openssl rand -hex 32)
ALLOWED_SIGN_IN=$EMAIL
PASSWORD_SIGN_IN=1
EOF
	chmod 600 "$ENV_FILE.tmp"
	mv "$ENV_FILE.tmp" "$ENV_FILE"
	say "Wrote $ENV_FILE."
	CREATE_OWNER=1
fi

say "Pulling images. This takes a few minutes the first time."
docker compose pull --ignore-pull-failures
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
