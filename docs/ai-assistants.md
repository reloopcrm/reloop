# AI assistants

Connect ChatGPT, Claude or Claude Code to your CRM through MCP. The assistant reads your contacts,
companies, deals, the Win back list and the mail story. It never writes a record and never sends
mail. You ask it a question, it reads, and you copy any text it writes into your own mail program.

## The address

The MCP server lives on the API at `/api/mcp`. A Docker install publishes the app and nothing
else, and the app forwards `/api/*` to the API inside the Docker network, so the address is your
own domain plus `/api/mcp`:

```
https://crm.example.com/api/mcp
```

The transport is Streamable HTTP, stateless, with JSON-RPC bodies. A client signs in in one of
two ways:

- **OAuth.** OAuth 2.1 authorization code with PKCE and dynamic client registration. The client
  registers itself, sends you to the Reloop sign-in, and you allow it on a consent screen. This is
  the way ChatGPT and Claude connect.
- **An API key.** Send the header `x-api-key` with a key from **Settings, API Keys**. It is the
  same key the REST API takes. See `docs/rest-api.md`.

The page **Settings, Connections, AI assistants** shows your own address and the steps for each
client.

## Connect ChatGPT

1. Open `chatgpt.com/plugins` and select the plus button, then **Add custom MCP server**.
2. Enter your address, for example `https://crm.example.com/api/mcp`.
3. Choose **OAuth** as the authentication.
4. Read the warning and confirm **I understand and want to continue**.
5. Select **Create as a plugin** and install it.
6. ChatGPT registers itself and sends you to Reloop. Sign in and allow.

ChatGPT needs an https address. An install on `localhost` needs a tunnel in front of it.

## Connect Claude

1. Open **Customize**, then **Connectors**, then **Add custom connector**.
2. Enter your address.
3. Under **OAuth client** choose **Register automatically**.
4. Select **Add**, then **Connect**. Sign in to Reloop and allow.

On a Team or Enterprise plan an Owner adds the connector once under **Organization settings,
Connectors**: select **Add**, then **Custom**, and choose the type **Web**. Then each member
selects **Connect**. The Free plan allows one custom connector.

## Connect Claude Code

```sh
claude mcp add --transport http reloop https://crm.example.com/api/mcp
```

Then type `/mcp` inside Claude Code and sign in in the browser. To use a key instead of the
browser sign-in:

```sh
claude mcp add --transport http reloop https://crm.example.com/api/mcp --header "x-api-key: YOUR_KEY"
```

## Other clients

Any MCP client that speaks Streamable HTTP works. It signs in with OAuth and dynamic client
registration, or it sends a fixed header. This lists the tools with a key:

```sh
curl -X POST https://crm.example.com/api/mcp \
  -H "x-api-key: YOUR_KEY" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A client finds the OAuth endpoints from two discovery documents:

```
https://crm.example.com/.well-known/oauth-protected-resource/api/mcp
https://crm.example.com/.well-known/oauth-authorization-server/api/auth
```

The issuer is `https://crm.example.com/api/auth`. The endpoints are `/api/auth/oauth2/authorize`,
`/api/auth/oauth2/token` and `/api/auth/oauth2/register`. The scope is `crm:read`. An access token
lives one hour. A refresh token lives thirty days.

## What the assistant can read

There are seven tools. All of them only read.

- `search` finds contacts, companies and deals by a word.
- `fetch` returns one record by the id that `search` returned.
- `list_win_back_candidates` returns the Win back list in the order the page ranks it.
- `get_contact` returns the record, its story and its facts.
- `get_contact_mails` returns the mails the Win back person page shows: subject, direction,
  summary and excerpt. It never returns raw MIME.
- `get_contact_draft` returns the draft Reloop prepared for that person, if one exists.
- `get_thread` returns one conversation with its summaries and excerpts.

Reading a person or a thread queues the same agent work that opening that page queues: a story
refresh or a summary refresh.

## What the assistant cannot do

No tool writes a record, sends a mail or changes a setting. The assistant cannot edit a contact,
move a deal or touch a mailbox. Reloop sends no mail for it.

When you ask the assistant a question, it pulls CRM records and mail-derived text out to the
vendor that runs it: OpenAI, Anthropic or whoever runs your client. Summaries, excerpts and the
draft leave in that way. That is your choice, and it happens only when you ask. Connect an
assistant only if you accept it.

## Revoke access

Open **Settings, Connections, AI assistants** and select **Revoke** next to the client. That ends
its tokens and its consent.

Removing a member from the workspace deletes every OAuth token and consent of that person, as
well as their sessions and API keys. An operator does the same from the shell:

```sh
bun apps/api/scripts/sign-in-grants.ts revoke person@example.com
```

Access tokens are opaque and checked in the database on every call, so a revoke works at once.
An `x-api-key` header is refused on every `/api/auth/oauth2/*` route, so a leaked key cannot
connect an assistant.

## Self-host notes

- ChatGPT and Claude need an https address. Use a domain with a certificate, or a tunnel.
- The two discovery addresses must be reachable on the public origin. They live at
  `/.well-known/...`, outside `/api/*`. The app forwards them to the API like `/api/*`. A reverse
  proxy in front of the app must pass them through as well.
- Anyone can register a client, because registration is open. A client gets nothing until a user
  signs in and allows it.
