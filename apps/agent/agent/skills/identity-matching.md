---
name: identity-matching
description: How to put a name to a CRM email address from the mail we already hold and the public accounts on the record, and when to refuse.
---

# Identity matching

You are given an email address and a company. You need the person. Getting this
wrong writes a stranger's career onto a customer's record, so the procedure is
built to fail closed.

## Why the obvious approach does not work

`pmarchetti@fernhill.com` is not a name. Searching for it directly returns nothing.
Asking a model what it stands for produces "Paula Marchetti" — which happens to be
right, and would have been just as confident had it been wrong. You cannot tell
the difference afterwards, which is why guessing is banned outright.

What works is handing over every clue you already hold — the address itself, the
name on the record, the employer and its domain — and letting the check match
them against a real account. The clues go into the **query**, and the answer
comes from the account.

That is the shape of every match: say where to look, never what you will find.

## The procedure

0. **`read_crm_history` first.** It is free and it is usually decisive. If they
   have ever replied to us from that address, you already have the strongest
   evidence available here — `crm.thread-reply` — and a signature block may hand
   you their title as well. Start every match here, not at a search engine.
1. **`find_contact_socials`** when the CRM holds no public account for them. It
   returns candidates only. Pass them to **`set_contact_socials`**, which
   re-checks each one against the account itself before it writes anything.
2. **A GitHub account that names them or their employer** is
   `github.account-identity`. That check runs in code, not in your reading of
   the page.
3. **`research_person`** is open-web context for a call, never a source of truth
   about who somebody is or what their title is.
4. If nothing passes, **stop**. Leaving "Pmarchetti" in the CRM is the correct
   outcome when you do not know.

**There is no LinkedIn reader on this install.** A LinkedIn URL on a record is a
link a rep can open. It is not something you can read, so it proves nothing on
its own.

## Reporting the match

Call `identify_contact` with what you actually saw:

| What you have | Evidence to record | What happens |
| --- | --- | --- |
| They replied from that address | `crm.thread-reply` | Written to the record. |
| The GitHub account names them | `github.account-identity` | Written to the record. |
| Their own signature says so | `crm.signature-block` | Supporting only. It never fills a blank alone. |
| One check passes | `employer-only`, or the page as `search.cites-profile` | Offered to a rep as a suggestion. |
| Sources disagree | add a `contradiction` entry | Held. Nobody is shown a guess. |

The `sourceUrl` to cite is the one the tool hands back. A lookup that comes back
with no source is a lookup you cannot write a fact from.

The `One check passes` row is the case this exists for. Four Marchettis work at
Fernhill; a human settles that in three seconds, and the old rule — throw away
anything short of certain — meant we learned nothing from the lookup. A
suggestion is not a failed match. It is the match, handed to the one person who
can finish it.

Do not add evidence you did not observe to push a claim over a line.

## Things that look like evidence and are not

- **A search result.** Search says where to look. A query for "Paula Marchetti"
  once returned Brightwater's CEO, an HR lead at Reply, and a data engineer in
  Seattle — all with total confidence.
- **A matching first name.** Half the Chrises at a company are not your Chris.
  The surname or the employer has to carry it.
- **Perplexity's view of somebody's job title.** It aggregates stale sources; it
  said "Account Executive L3" for a profile that reads "Growth Specialist at
  Fernhill". A title you cannot source to the person is a suggestion at best.
- **A very plausible expansion.** `jsmith` is probably J. Smith. Probably is not
  a source.

## When the person genuinely is not findable

Some people leave no public trace, or one that cannot be reconciled with their
address. Say so plainly and move on. A contact that keeps its placeholder name
is a contact a human can fix in five seconds; a contact with the wrong person's
job history is one nobody knows to fix.
