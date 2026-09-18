# REST API

Every tRPC procedure of the CRM is also a REST endpoint. A script, a Zapier step or another
service calls the same code the web app calls, with the same validation and the same rules. The
bridge only translates the wire format.

## The base address

A Docker install publishes the app and nothing else. The app forwards `/api/*` to the API inside
the Docker network, so the base address is your own domain plus `/api/rest`:

```
https://crm.example.com/api/rest
```

An install that answered `localhost` to the domain question uses `http://localhost:3000/api/rest`.

A source install runs the API itself, by default on port 3001. Both of these reach the same
bridge:

```
http://localhost:3001/api/rest
http://localhost:3001/rest
```

`/rest` is the older mount and keeps working. Use `/api/rest` on Docker, because `/api/*` is the
only thing the app forwards to the API.

## Make a key

Open **Settings, API Keys** and select **New API key**. Give it a name and an expiry between 1
and 365 days, or no expiry. The key is shown one time. Copy it then. The CRM keeps only a hash of
it and cannot show it again.

Send the key in the `x-api-key` header on every call. Revoke a key on the same page. A revoked key
stops working at once.

A key carries the rights of the person who made it. Anyone who holds it reads and writes every
contact, company, deal and activity in the CRM. Keep it in a secrets store and revoke it the
moment it leaks.

## An example

This reads the first page of contacts:

```sh
curl -X POST https://crm.example.com/api/rest/contacts/search \
  -H "x-api-key: crm_your_key_here" \
  -H "content-type: application/json" \
  -d '{"pageSize": 10}'
```

The answer is `{ "rows": [...], "total": 42, "facetCounts": {...} }`. A list endpoint takes `q`,
`sort`, `dir`, `page` and `pageSize`, and the filters of that record type.

## Every endpoint

`GET /api/openapi.json` returns the OpenAPI document for the whole bridge. Feed it to a client
generator, to Postman or to an agent. It needs a key too:

```sh
curl https://crm.example.com/api/openapi.json -H "x-api-key: crm_your_key_here"
```

The document names every endpoint and every input shape, which is a map for a stranger, so it is
never public. Without a key or a session it answers 401, in development and in production alike.
A development install also serves a browsable version of it at the API address itself, on
port 3001. That one is off in production.

## What a key cannot do

A key cannot make another key, and it cannot change a password. These refuse an `x-api-key` header
and answer 401, whatever the key is:

| Endpoint | Procedure |
| --- | --- |
| `GET /api/rest/api-keys` | `apiKeys.list` |
| `POST /api/rest/api-keys` | `apiKeys.create` |
| `DELETE /api/rest/api-keys/{id}` | `apiKeys.revoke` |
| `PUT /api/rest/settings/password` | `settings.setPassword` |

The `/api/auth/api-key/*` routes, `POST /api/auth/change-password` and
`POST /api/auth/set-password` refuse a key the same way.

This is deliberate. A leaked key is bad. A leaked key that mints more keys and locks you out of
your own account is worse. Making and revoking keys stays a thing you do while signed in to the
CRM. A 401 on those four endpoints is the rule working, not the API being broken.
