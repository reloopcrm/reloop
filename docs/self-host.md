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

1. **Domain.** A name like `crm.example.com`, or Enter for `localhost`. With `localhost` the app opens at `http://localhost:3000`. Sign-in works there because the session cookie drops the `__Secure-` prefix on plain http. A real domain gets HTTPS and the secure cookie.
2. **Existing reverse proxy.** Asked only for a domain. Answer "no" and the bundled Caddy gets a certificate and serves HTTPS on ports 80 and 443.
3. **Owner email.** The first account. It is the only address in `ALLOWED_SIGN_IN`.
4. **Owner password.** 12 to 128 characters. You type it twice. It is never written to disk.

The script then:

- reads the newest release from GitHub and writes it to `RELOOP_VERSION`, so the install runs a released version and not a branch build,
- downloads `docker-compose.yml` and the `Caddyfile` from that release tag,
- generates `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `AGENT_BRIDGE_SECRET` and `CRON_SECRET` with `openssl`,
- writes `deploy/.env` with permissions `600`,
- pulls the images and starts them with Docker Compose,
- creates the owner account and prints the address to open.

Running the script again keeps an existing `deploy/.env`. It never replaces a secret and never touches the database volume. After the stack is up it asks the API whether an account exists. When none does, for example because the first run failed after writing `deploy/.env`, it asks for the owner email and password again and creates the account. When one does, it leaves that account and its password alone.

### Which version it installs

`RELOOP_VERSION` in `deploy/.env` decides which images run, and the installer pins
it to the newest release. A release tag is built from a tag, so nothing that lands
on `main` reaches your server until it is released.

To pick the version yourself, set it before you run the script:

```bash
RELOOP_VERSION=1.16.0 sh install.sh
```

To follow the newest images instead, set `RELOOP_VERSION=latest`. That is the
setting the Update button needs, and it also takes every build of `main`, so it
trades the pin for the convenience. The installer never changes an existing
`deploy/.env`, so an install made before this keeps what it has.

### Install without questions

Set the answers as variables and the script asks nothing:

```bash
curl -fsSL https://reloopcrm.com/install.sh -o install.sh
RELOOP_DOMAIN=crm.example.com RELOOP_EMAIL=you@example.com RELOOP_PASSWORD='a long password' sh install.sh
```

This also helps on a keyboard where `@` needs the Option key. Some terminals send Option as Meta, so a typed `@` arrives as `^[`.

### What runs

| Service | Image | Purpose |
| --- | --- | --- |
| `postgres` | `postgres:17` | The database. Not published to the host. |
| `api` | `ghcr.io/reloopcrm/reloop-api` | Auth, data, mailbox sync. Applies database migrations on every start. |
| `app` | `ghcr.io/reloopcrm/reloop-app` | The web app, on `127.0.0.1:3000`. |
| `agent` | `ghcr.io/reloopcrm/reloop-agent` | The AI agent. |
| `caddy` | `caddy:2` | HTTPS. Runs only with the `caddy` profile. |
| `updater` | `containrrr/watchtower:1.7.1` | The Update button in Settings. Runs only with the `updater` profile. |

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

## Add a colleague

The owner and every admin add people in the app. Open **Settings, Members** and choose **Add person**. Enter the address, the name and the role. The CRM creates the account and shows a one-time password once. Copy it and pass it to the person yourself. They sign in with the address and that password, and they change it in **Settings, General**.

Two rules decide whether the button works:

- **The owner grants the address as part of adding the person.** A default install writes only your own address into `ALLOWED_SIGN_IN`, so a colleague would be refused. The owner adding them writes the address to a second list in the database, and sign-in then accepts both lists. `ALLOWED_SIGN_IN` stays the floor: the app only adds to the database list and never edits the environment. An admin who is not the owner still gets the old message naming the value to put in `deploy/.env`.
- `PASSWORD_SIGN_IN="1"` must be set, because the new person signs in with a password. Without it the button stays hidden. With Google, Microsoft or an identity provider a colleague on an allowed domain signs in alone and needs no account from you.

Your own session must be less than five minutes old, the same rule that guards a password change. Sign out and sign in again when the CRM asks for it.

The shell still works and does the same thing:

```sh
printf '%s' 'a long password' | docker compose exec -T api bun apps/api/scripts/create-owner.ts colleague@example.com
```

That script creates the account and sets the password. The person becomes a member on the first sign-in. Change the role in **Settings, Members**.

Removing a person is not in the app. Take the address off `ALLOWED_SIGN_IN` in `deploy/.env` and run `docker compose up -d` in the `deploy` folder. The next request locks the person out. The account, the member row and every record stay. For a person on a domain you keep, set a password only you know with the script above; that also ends every session they have.

An address the owner granted in the app sits in the database, not in `deploy/.env`, so the step above does not reach it. List and remove those addresses in the `deploy` folder:

```sh
docker compose exec -T api bun apps/api/scripts/sign-in-grants.ts list
docker compose exec -T api bun apps/api/scripts/sign-in-grants.ts revoke colleague@example.com
```

The next request locks that person out.

## Connect a mailbox

Open **Settings, Connections**. IMAP works with any provider and needs no extra setup.

Google and Microsoft need an OAuth client of your own:

- Google: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The redirect URI is `https://your-domain/api/auth/callback/google`.
- Microsoft: set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. The redirect URI is `https://your-domain/api/auth/callback/microsoft`.

Add the variables to `deploy/.env`, then run `docker compose up -d` in the `deploy` folder. The mailbox sync runs every five minutes inside the API. `MAILBOX_SYNC_INTERVAL_MS` changes that.

## Set up AI

Without AI the CRM works as a normal CRM. The agent needs one of these:

### OpenRouter

OpenRouter is one key for every model vendor and the default for a self-hosted install.

1. Create an account at [openrouter.ai](https://openrouter.ai) and buy credits. Credits are prepaid, there is no subscription.
2. Create a key at [openrouter.ai/keys](https://openrouter.ai/keys).
3. Open **Settings, AI**, choose **OpenRouter**, paste the key and save.

The agent starts on `openai/gpt-5.6-luna`. At the time of writing OpenRouter lists it at 0.20 USD per million input tokens and 1.20 USD per million output tokens. Pick another model in the same panel, any id from [openrouter.ai/models](https://openrouter.ai/models) that supports tools works.

To keep the key out of the database, set `OPENROUTER_API_KEY` in `deploy/.env` instead and run `docker compose up -d`. A key pasted in the settings page wins over the variable.

### Your own API key

Open **Settings, AI** and add an OpenAI or Anthropic API key. The agent uses it from the next task on.

### ChatGPT subscription (experimental)

The agent can use a ChatGPT subscription through the Codex login. This path is experimental and can stop working when OpenAI changes it.

Open **Settings, AI** and start the ChatGPT sign-in. The page shows a link and a code. Open the link and enter the code.

The agent image does not contain the Codex command line. The first sign-in downloads it from npm into the `codex` volume. The download is about 280 MB. The agent needs internet access at that moment. The settings page shows "Starting the ChatGPT sign-in" while the download runs. When the download fails, the page shows the reason. Start the sign-in again when the agent is online.

The login and the Codex command line are kept in the `codex` volume, so they survive restarts and updates. After the first sign-in, the command line is also available in the container:

```sh
docker compose exec agent /data/codex/cli/node_modules/.bin/codex login status
```

## Update

In the `deploy` folder:

```sh
docker compose pull
docker compose up -d
```

The API applies new database migrations when it starts. `RELOOP_VERSION` in
`deploy/.env` names the release you run, so raise it to the version you want and
run the two commands. `RELOOP_VERSION=latest` takes the newest images every time.

### Update from the app

Settings shows an **Update now** button to the workspace owner when a newer release exists and the updater runs. The button runs the two commands above for you.

The updater is a separate container, [watchtower](https://containrrr.dev/watchtower/). It holds the Docker socket, so it can pull images and restart containers. It touches only the containers with the label `com.centurylinklabs.watchtower.scope=reloop`. The app itself never sees the Docker socket. The API reaches the updater inside the Docker network with the token `UPDATER_TOKEN` from `deploy/.env`.

The trade-off in plain words: whoever reaches the updater with the token can restart Reloop at any time. That is why the updater is off by default and why the token must stay secret. Keep `deploy/.env` at permissions `600` and never publish port 8080 of the updater.

To turn it on, add `updater` to `COMPOSE_PROFILES` in `deploy/.env`:

```
COMPOSE_PROFILES=updater
```

With the bundled Caddy the line is `COMPOSE_PROFILES=caddy,updater`. An install made before this feature has no `UPDATER_TOKEN` in `deploy/.env`. Add one with `openssl rand -hex 32`. Then run `docker compose up -d` in the `deploy` folder.

The button does nothing useful when `RELOOP_VERSION` names a fixed version, which
is what a new install gets: the updater pulls that version, finds nothing new and
stops. Either raise the version in `deploy/.env` and run `docker compose up -d`, or
set `RELOOP_VERSION=latest` and accept that the server then follows every build.

An operator who does not want this leaves the profile off and uses the two commands. The button then stays hidden.

An install that an operator keeps up to date, such as a server that runs from source, sets `RELOOP_MANAGED=true`. The Version card then shows the version and the state only, without the command and without the button.

### Update automatically on a source install

A server that runs from source under systemd, without Docker images, can update
itself. `deploy/self-update/` holds a shell script, a systemd service and a
timer. Every 15 minutes the script compares the newest `vX.Y.Z` tag on GitHub
with the installed version. When a newer one exists it dumps the database,
builds the release in a new folder, switches `/opt/reloop/app` to it and checks
that the app and the API answer. When they do not, it switches back. The
[README in that folder](../deploy/self-update/README.md) has the install steps,
the rollback steps and the warning that a health check is not a review.

## Which container sees which secret

`deploy/docker-compose.yml` gives each service only the variables it reads. The
agent never sees `CRON_SECRET`, `UPDATER_TOKEN` or the Google, Microsoft and Slack
client secrets; the app never sees `CRON_SECRET`, `UPDATER_TOKEN` or the model
keys. All three read the database, so all three hold `DATABASE_URL`.

A variable you add to `deploy/.env` only reaches a container that lists it. If you
set one the list does not name, add it to that service's `environment:` block and
run `docker compose up -d`. A missing variable removes a capability and never
stops the container.

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
