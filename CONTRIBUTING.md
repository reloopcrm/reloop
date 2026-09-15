# Contributing

Thanks for wanting to help with Reloop CRM.

Start with a short issue that says what you want to change and why. One paragraph is enough. Please don't have AI expand a one paragraph idea into a formal proposal: the paragraph was the useful part. Bigger design decisions go in as a `.md` file in [`adrs/`](./adrs/).

When you send code, lead with why, and keep the diff small enough that a person can hold it in their head.

Report security vulnerabilities privately, see [`SECURITY.md`](./SECURITY.md), not in a public issue.

## Contributor License Agreement

Before your first pull request is merged, a bot asks you to sign the [CLA](./CLA.md) with one comment. You keep the copyright on your contribution. The CLA lets the project use it under the AGPL and in the hosted Reloop CRM Cloud.

## Running it

```sh
cp .env.example .env      # fill in DATABASE_URL, BETTER_AUTH_SECRET and ALLOWED_SIGN_IN
bun install
docker compose up -d
bun run db:deploy
bun run dev
```

More in [`docs/setup.md`](./docs/setup.md). To run the full product the way a self-hoster does, see [`docs/self-host.md`](./docs/self-host.md).

## Before you push

```sh
bun run check-types
bun run lint
bun run lint:slop
bun run test
```

All four run on CI, and `bun run format` fixes most of what `lint` complains about.

`lint:slop` is [anti-slop](https://github.com/dmmulroy/anti-slop) over Oxlint, and it holds one line: **data crossing an I/O boundary is parsed into a domain type at the point it arrives.** No `Record<string, unknown>` standing in for a contract, no `typeof` check standing in for a parser, no `unknown` parameter without a schema, no `as unknown as` around a `Json` column. Shapes that cross a package boundary live in `packages/validation/src`, one module per shape. A genuinely open map is scoped off in `.oxlintrc.json` with its reason, and that is the only sanctioned way past it.

**A `pre-push` hook runs them for you.** `bun install` wires it up: the hooks live in `.githooks/` and `prepare` points `core.hooksPath` at them. `git push --no-verify` skips it, and `CRM_SKIP_HOOKS=1` skips it for a whole shell.

**The suite runs against `TEST_DATABASE_URL`, never `DATABASE_URL`, and refuses to start without it.** `bun run db:test` creates the database and migrates it; the name has to end in `_test`. These tests write and delete real rows, so never point `TEST_DATABASE_URL` at a database you care about.

**A test may not delete a row it did not create.** Where a spec needs state it cannot own, it asserts the precondition and fails, rather than clearing whatever is in the way.

**`test` runs one package at a time (`turbo run test --concurrency=1`).** The integration tests of several packages share one database, so running them at once lets one package's fixtures land inside another package's assertions. Do not raise the concurrency without giving each package its own database.

A few things that trip people up:

- **The tRPC router type is generated, and committed.** If the app can't see a procedure you just added, run `bun run --filter=api trpc:generate` and commit `apps/api/src/generated/server.ts` alongside the router change.
- **Schema changes need a migration**, not `db:push`. `bun run db:migrate` creates one.
- **New environment variables need a home.** Add them to `.env.example` and, if the API reads them, to `apps/api/src/config/env.validation.ts`.
- **The German dictionary test.** The product is English. German is an optional translation. If `german-dictionary.spec` fails on a new `t()` text, add the key to the matching file in `apps/app/lib/i18n/de/` with the English text as its value.

## Shipping a change

Branch from `main` and open a pull request into `main`. The repo squashes, so **the pull request title becomes the commit subject and the changelog line**. Write it as a [Conventional Commit](https://www.conventionalcommits.org/): `feat(api): …`, `fix(db): …`.

| Title | Bump | Appears under |
| --- | --- | --- |
| `feat(app): …` | minor | Features |
| `fix(db): …` | patch | Fixes |
| `perf:`, `refactor:`, `docs:`, `revert:` | patch | their own heading |
| `feat(db)!: …` | major | Features, flagged as breaking |
| `chore:`, `ci:`, `test:`, `build:`, `style:` | none | nothing |

The `!` is how you declare a break. A `BREAKING CHANGE:` footer will not work, because the squashed commit body is left empty.

## Releases

[release-please](https://github.com/googleapis/release-please) keeps one pull request open, `chore(main): release x.y.z`, that collects every releasable commit. Merging it writes `CHANGELOG.md`, bumps the version, tags `vx.y.z` and publishes the GitHub Release. The tag builds the Docker images.

**A release PR with nothing in it is not a bug.** A run of `chore:` and `test:` commits bumps nothing.

**When it jams**, the Release workflow fails on a merged release pull request that still carries `autorelease: pending`. Create the tag and GitHub Release at that pull request's merge commit by hand, then swap the label for `autorelease: tagged`. `workflow_dispatch` lets you re-run the workflow from the Actions tab afterwards.

## House style

The rules are written down where the work happens:

- [`AGENTS.md`](./AGENTS.md): the rules that apply to everything, and where the others live.
- [`docs/design.md`](./docs/design.md): UI. `packages/ui` is the only place components come from, and you don't override its styles at the call site.
- [`docs/api.md`](./docs/api.md): logging, tRPC, caching, and why intelligence never lives in the API.

Two that explain most review comments:

**No code comments.** Names and small functions carry the meaning. The why belongs in the pull request, an ADR or the docs.

**Nothing about a person is guessed.** This is a CRM: a confidently wrong fact about a real customer is worse than a blank field, because nobody can tell it's wrong.

## Reporting a bug

Include what you expected, what happened, and enough to reproduce it. If it involves the agent, the session transcript is worth more than a description of it, but read it first and redact anything that belongs to a real customer.
