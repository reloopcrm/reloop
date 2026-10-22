# Changelog

## [0.23.0](https://github.com/reloopcrm/reloop/compare/v0.22.0...v0.23.0) (2026-10-22)


### Features

* **api:** connect ChatGPT, Claude and Claude Code through MCP ([6f5b0b4](https://github.com/reloopcrm/reloop/commit/6f5b0b4c79e6d96013c07d99364aac2d44327bb8))
* **api:** MCP server, consent page and AI assistant settings ([c1e1136](https://github.com/reloopcrm/reloop/commit/c1e11366f0e29872651ddabbe3f0ea700d3d3b9d))
* **api:** mcp.status and mcp.revoke list and end AI client grants ([193e396](https://github.com/reloopcrm/reloop/commit/193e3969653fee4db95214aa4fc2c0ef39a5563a))
* **app:** a slot for extra sidebar sections ([#4](https://github.com/reloopcrm/reloop/issues/4)) ([b2d977a](https://github.com/reloopcrm/reloop/commit/b2d977afbdf35c47f612d1e0c05f5dd8fbb314c0))
* **auth:** OAuth provider and MCP contracts for AI clients ([c04b3a8](https://github.com/reloopcrm/reloop/commit/c04b3a80fb877f7d988107bd5ea08ca5b821181a))
* **auth:** scoped MCP address slot for hosted installs ([#2](https://github.com/reloopcrm/reloop/issues/2)) ([92e9cb1](https://github.com/reloopcrm/reloop/commit/92e9cb1c5e9c189ef7c5de6b271da56db737bbf1))


### Fixes

* **app:** reserve the consent slug and keep client names out of the markup check ([beef1cc](https://github.com/reloopcrm/reloop/commit/beef1cc3c5d1bb334c9fb078a823c4b6320b0f9f))
* **auth:** revoking an AI client also ends its open authorization codes ([02ccfdd](https://github.com/reloopcrm/reloop/commit/02ccfdd7ae07cb28e5c468cf9b75bbb454cdf08e))
* **imap:** retry a refused login instead of locking the mailbox ([#5](https://github.com/reloopcrm/reloop/issues/5)) ([fc70623](https://github.com/reloopcrm/reloop/commit/fc70623a5948de252e53c57063ec728c4d532023))


### Documentation

* **security:** name the MCP procedures a key cannot call and the token lifetime ([e1d0de3](https://github.com/reloopcrm/reloop/commit/e1d0de3c4a4bc9084e314b3f0d71413d3f147feb))

## 0.22.0 (2026-10-18)

This is the first release from this repository.

### Features

* **agent:** read quiet customers early so win back fills in the first session
* **connections:** reconnect Google or Microsoft with one button and keep every setting
* **mailbox:** link every participant of a thread to its contact
* **win-back:** 'remind me in 7 days' hides the person until then, with a Snoozed filter
* **win-back:** a 'replied' filter, a dashboard link to it, and 'Reply to them' on the person page
* **win-back:** a hard no leaves the win-back list, a soft no stays marked as declined
* **win-back:** continue with never starts over and shows the place in the list
* **win-back:** out-of-office replies and bounces never count as an answer
* **win-back:** prefetch stories for the top of the list and the next person
* **win-back:** write drafts ahead, refresh stale follow-up drafts, and never write two drafts for one mail

### Fixes

* **agent:** a research click also upgrades a task that was claimed but never ran
* **agent:** a research click upgrades the waiting automatic task instead of being lost
* **agent:** failed brand reads retry, archived records stay out of research, research tools only for the research agent, no addresses in tool logs
* **agent:** lock a fact field and never overwrite a value that changed under the write
* **agent:** queue one backfill reading per unread thread instead of moving any open one
* **agent:** refund failed research calls, check the Perplexity key before charging, honest recheck results, settle a crashed brand read, parse Perplexity answers, cap the website body, one research config
* **agent:** research active contacts, research every new sync contact, and catch up summary language
* **agents:** a team agent run is never sent twice when its status write fails
* **api:** a rate limit per API key on REST and tRPC
* **api:** agents.resume and agents.restore accept a session only
* **api:** check the sign-in allow-list on the export, attachment and profile routes
* **api:** write no dash in API messages so English users see none
* **attention:** let a decline win over a quiet contact so it never reads Write again
* **auth:** a custom workspace slug survives every sign-in
* **calendar:** cancelled, moved and uninvited Google events update the timeline, and large calendars sync over several ticks
* **calendar:** meeting prep runs once when a meeting comes within 7 days and never for declined, cancelled or past meetings
* **calendar:** release a revoked rep's hold on shared events
* **chat:** a builder message is never sent to the agent twice when the status write fails
* **chat:** show an administrator a safe agent hint
* **connections:** show a stopped mailbox as needing attention and translate connect and sync errors
* **contacts:** creating a contact returns 409 for a duplicate or suppressed address and 400 for an unknown company or owner
* **currency:** hide stale base amounts and stop counting amountless deals as unconverted
* **db:** bun install works in a fresh checkout without .env
* **db:** count only research sessions that ran in the monthly usage
* **db:** db:generate and build work without DATABASE_URL
* **db:** load the root .env and resolve prisma without PATH in db:test
* **db:** run prisma generate through the running bun binary so the image build works without bunx
* **deals:** leave archived deals out of the dashboard, the unconverted count and the company and contact sheets
* **deals:** moving a deal recomputes the old company's last activity and locks contacts and both companies
* **deals:** one open deal per quote, clean contacts on company change, reasons on closed stages, no stage change on archived deals
* **exports:** export in the list's sort, format numbers by the file's language, neutralise field labels
* **exports:** no formula injection in CSV headers, names for person fields, and a visible failure when the export breaks
* **imap:** re-read history when a creating rule is turned on
* **mailbox:** add every sender of a relevant thread from the company domain as a contact
* **mailbox:** count real-answer text in code points and match JS whitespace in SQL
* **mailbox:** parse Gmail, Calendar and Graph responses with Zod at the client
* **mailbox:** skip a message the store keeps rejecting after three attempts so the cursor moves on
* **mailbox:** walk a cursor past relevant threads that are not worth adopting
* **members:** clear a removed member's mailbox tokens and stop their mailboxes
* **onboarding:** explain a cancelled Google grant, open the dashboard for manual records, no spinner without AI, reserve every route slug
* **onboarding:** no stuck spinner, no hanging key check, one own-data check
* **quotes:** a click or Enter on a quote row opens the company
* **quotes:** the quotes list is a data table with phone cards and no sideways scroll
* **search:** quick search hides archived records, finds full names, and shows a loading state
* **security:** refuse API keys on agent code changes and end sessions and keys when a sign-in grant is revoked
* **security:** stub the grant lookup in the two session tests and run every security group
* **slack:** the agent can never notify a whole channel or a person through injected text
* **test:** hold the demo lock before asserting and close every seed transaction
* **test:** make the suites that time out under load deterministic
* **test:** the enrichment queue spec finds its own rows behind a full page of other open tasks
* **tracking:** honeypot, per-client form limit, deferred forms refiled later
* **tracking:** parse the collector batch with Zod and drop bad events quietly
* **ui:** cap dialog height at the viewport and scroll inside, use container token
* **ui:** open a clickable table row with Enter or Space
* **webhooks:** purge form submissions and open deliveries, close SSRF gaps
* **webhooks:** require https for webhook addresses and show no secret characters
* **webhooks:** retry a failed delivery with backoff
* **win-back:** a follow-up whose decider and owner were removed goes to the oldest active owner or admin
* **win-back:** count only people with an address in the place in the list
* **win-back:** removed members get no follow-up tasks, and rule defaults come from one place
* **win-back:** show every rejected person in Not for us regardless of the include rules
* **win-back:** tell the user to connect an AI provider when reading cannot run
* **win-back:** the 'answered' card and its filtered list show the same people

### Performance

* **win-back:** store a real-answer flag per mail so the replied filter stops running a regex over every mail

### Refactors

* move tunable constants into the area config and drop code comments

### Documentation
