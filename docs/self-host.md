# Self-host Reloop CRM

Reloop CRM runs on your own server with Docker. One command installs it.

## Requirements

- A Linux server. The installer sets Docker up for you when it is missing, using Docker's own install script, and starts it.
- On macOS the installer starts OrbStack or Docker Desktop, and installs OrbStack through Homebrew when neither is there.
- 4 GB of RAM. 2 GB works for one user but leaves little room.
- 20 GB of free disk space for the images, the database and backups.
- `openssl` and `curl`. Most distributions ship both.
- For a public install: a domain name whose DNS record points at the server, and ports 80 and 443 open.

The images are built for `linux/amd64` and `linux/arm64`.

## Install

```sh
curl -fsSL https://reloopcrm.com/install.sh | sh
```

The script installs into `~/reloop/deploy`. Set `RELOOP_DIR` to choose another folder.

### What install.sh asks

1. **Domain.** A name like `crm.example.com`, or Enter for `localhost`. With `localhost` the app opens at `http://localhost:3000`. Sign-in on plain http localhost does not work in Safari. For a local test use Chrome or Firefox, or use a real https domain.
2. **Existing reverse proxy.** Asked only for a domain. Answer "no" and the bundled Caddy gets a certificate and serves HTTPS on ports 80 and 443.
3. **Owner email.** The first account. It is the only address in `ALLOWED_SIGN_IN`.
4. **Owner password.** 12 to 128 characters. You type it twice. It is never written to disk.

The script then:

- generates `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `AGENT_BRIDGE_SECRET` and `CRON_SECRET` with `openssl`,
- writes `deploy/.env` with permissions `600`,
- pulls the images and starts them with Docker Compose,
- creates the owner account and prints the address to open.

Running the script again keeps an existing `deploy/.env`. It never replaces a secret and never touches the database volume.

### What runs

| Service | Image | Purpose |
| --- | --- | --- |
| `postgres` | `postgres:17` | The database. Not published to the host. |
| `api` | `ghcr.io/reloopcrm/reloop-api` | Auth, data, mailbox sync. Applies database migrations on every start. |
| `app` | `ghcr.io/reloopcrm/reloop-app` | The web app, on `127.0.0.1:3000`. |
| `agent` | `ghcr.io/reloopcrm/reloop-agent` | The AI agent. |
| `caddy` | `caddy:2` | HTTPS. Runs only with the `caddy` profile. |

The browser only talks to the app. The app forwards `/api/*` to the API inside the Docker network.

## Use an existing reverse proxy

Answer "yes" to the reverse proxy question. Caddy then stays off, and the app listens on `127.0.0.1:3000`.

Send every path of your domain to that address, for example with Caddy:

```
crm.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

When your proxy runs in its own container, `127.0.0.1` is not the host. Set `APP_BIND=0.0.0.0` in `deploy/.env`, block port 3000 in your firewall, and point the proxy at the host address. Then run `docker compose up -d` in the `deploy` folder.

## Connect a mailbox

Open **Settings, Connections**. IMAP works with any provider and needs no extra setup.

Google and Microsoft need an OAuth client of your own:

- Google: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The redirect URI is `https://your-domain/api/auth/callback/google`.
- Microsoft: set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. The redirect URI is `https://your-domain/api/auth/callback/microsoft`.

Add the variables to `deploy/.env`, then run `docker compose up -d` in the `deploy` folder. The mailbox sync runs every five minutes inside the API. `MAILBOX_SYNC_INTERVAL_MS` changes that.

## Set up AI

Without AI the CRM works as a normal CRM. The agent needs one of these:

### Your own API key

Open **Settings, General** and add an OpenAI or Anthropic API key. The agent uses it from the next task on.

### ChatGPT subscription (experimental)

The agent can use a ChatGPT subscription through the Codex login. This path is experimental and can stop working when OpenAI changes it.

```sh
docker compose exec agent codex login --device-auth
```

Open the link it prints and enter the code. The login is kept in the `codex` volume, so it survives restarts and updates.

## Update

In the `deploy` folder:

```sh
docker compose pull
docker compose up -d
```

The API applies new database migrations when it starts. To stay on one release, set `RELOOP_VERSION` in `deploy/.env` to a version such as `1.16.0`.

## Back up

Everything lives in the `postgres-data` volume and in `deploy/.env`. Without that `.env` file the database cannot be opened again.

One simple approach is a nightly compressed dump that overwrites the previous one. Add this line with `crontab -e`, and change the folder:

```
0 3 * * * cd /home/you/reloop/deploy && docker compose exec -T postgres pg_dump -U reloop reloop | gzip > /home/you/reloop-backup.sql.gz
```

Copy the dump and `deploy/.env` to a second machine from time to time. Make an extra dump before every update.

## Uninstall

In the `deploy` folder:

```sh
docker compose down
```

This stops Reloop and keeps the data. To delete the data as well, including the database and the Codex login:

```sh
docker compose down --volumes
```

This cannot be undone. Make a backup first. Then remove the install folder.
