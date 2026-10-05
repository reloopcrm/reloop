import { describe, expect, it } from "bun:test";
import type { MatchContext } from "../src/mailbox/mailbox-match.service";
import {
	planThread,
	senderVerdict,
	type ThreadMessage,
} from "../src/mailbox/thread-contacts";
import {
	readThreadContactsCursor,
	serialiseThreadContactsCursor,
} from "../src/mailbox/thread-contacts-cursor";

const company = { id: "company-1", domain: "kunde.example", archivedAt: null };

const context: MatchContext = {
	ourAddresses: new Set(["rep@own.example"]),
	ourDomains: new Set(["own.example"]),
	suppressedDomains: new Set(["blocked.example"]),
	suppressedEmails: new Set(["gone@kunde.example"]),
};

const policy = { context, creatingOwners: new Set(["user-1"]) };

function inbound(
	fromEmail: string,
	overrides: Partial<ThreadMessage> = {},
): ThreadMessage {
	return {
		direction: "INBOUND",
		fromEmail,
		fromName: "Preview Person",
		subject: "Re: Angebot",
		body: "Wir brauchen zwei Paletten.",
		snippet: null,
		syncedByUserId: "user-1",
		sentAt: new Date("2026-09-17T10:00:00Z"),
		recipients: [],
		...overrides,
	} satisfies ThreadMessage;
}

function verdict(message: ThreadMessage) {
	return senderVerdict(message, "Angebot", "kunde.example", context);
}

describe("senderVerdict", () => {
	it("creates a person at the company domain", () => {
		expect(verdict(inbound("preview@kunde.example"))).toBe("create");
	});

	it("refuses another domain", () => {
		expect(verdict(inbound("preview@andere.example"))).toBe("other-domain");
	});

	it("refuses an automatic reply", () => {
		expect(
			verdict(
				inbound("preview@kunde.example", {
					subject: "Automatische Antwort: Angebot",
				}),
			),
		).toBe("auto-reply");
	});

	it("refuses an own address and an own domain", () => {
		expect(verdict(inbound("rep@own.example"))).toBe("own");
		expect(verdict(inbound("colleague@own.example"))).toBe("own");
	});

	it("refuses a role address and a machine address", () => {
		expect(verdict(inbound("info@kunde.example"))).toBe("automated");
		expect(verdict(inbound("noreply@kunde.example"))).toBe("automated");
	});

	it("refuses a suppressed address and a suppressed domain", () => {
		expect(verdict(inbound("gone@kunde.example"))).toBe("suppressed");
		expect(verdict(inbound("preview@blocked.example"))).toBe("suppressed");
	});

	it("refuses a free mail address", () => {
		expect(verdict(inbound("preview@gmail.com"))).toBe("free-mail");
	});
});

describe("planThread", () => {
	it("skips a thread without a company domain", () => {
		expect(
			planThread(
				{
					subject: null,
					company: null,
					messages: [inbound("a@kunde.example")],
				},
				policy,
			).skip,
		).toBe("no-company-domain");
		expect(
			planThread(
				{
					subject: null,
					company: { ...company, domain: null },
					messages: [],
				},
				policy,
			).skip,
		).toBe("no-company-domain");
	});

	it("skips a thread of an archived company", () => {
		expect(
			planThread(
				{
					subject: null,
					company: { ...company, archivedAt: new Date() },
					messages: [inbound("a@kunde.example")],
				},
				policy,
			).skip,
		).toBe("archived-company");
	});

	it("ignores outbound mail", () => {
		const plan = planThread(
			{
				subject: null,
				company,
				messages: [inbound("preview@kunde.example", { direction: "OUTBOUND" })],
			},
			policy,
		);
		expect(plan.senders).toEqual([]);
	});

	it("keeps one outcome per sender and prefers create", () => {
		const plan = planThread(
			{
				subject: "Angebot",
				company,
				messages: [
					inbound("preview@kunde.example", {
						subject: "Automatic reply: Angebot",
					}),
					inbound("PREVIEW@kunde.example"),
					inbound("other@andere.example"),
				],
			},
			policy,
		);
		expect(plan.companyId).toBe("company-1");
		expect(plan.senders).toEqual([
			{
				email: "preview@kunde.example",
				name: "Preview Person",
				domain: "kunde.example",
				verdict: "create",
				ownerId: "user-1",
				lastMailAt: new Date("2026-09-17T10:00:00Z"),
			},
			{
				email: "other@andere.example",
				name: "Preview Person",
				domain: "andere.example",
				verdict: "other-domain",
				ownerId: null,
				lastMailAt: new Date("2026-09-17T10:00:00Z"),
			},
		]);
	});

	it("dates a sender by the newest mail from or to them", () => {
		const plan = planThread(
			{
				subject: null,
				company,
				messages: [
					inbound("preview@kunde.example", {
						sentAt: new Date("2026-09-17T10:00:00Z"),
					}),
					inbound("preview@kunde.example", {
						sentAt: new Date("2026-09-19T10:00:00Z"),
					}),
					inbound("rep@own.example", {
						direction: "OUTBOUND",
						recipients: ["PREVIEW@kunde.example"],
						sentAt: new Date("2026-09-21T10:00:00Z"),
					}),
					inbound("rep@own.example", {
						direction: "OUTBOUND",
						recipients: ["other@kunde.example"],
						sentAt: new Date("2026-09-25T10:00:00Z"),
					}),
				],
			},
			policy,
		);
		expect(plan.senders).toHaveLength(1);
		expect(plan.senders[0]?.lastMailAt).toEqual(
			new Date("2026-09-21T10:00:00Z"),
		);
	});

	it("leaves automatic replies out of the last mail date", () => {
		const plan = planThread(
			{
				subject: "Angebot",
				company,
				messages: [
					inbound("preview@kunde.example", {
						sentAt: new Date("2026-09-17T10:00:00Z"),
					}),
					inbound("preview@kunde.example", {
						subject: "Automatische Antwort: Angebot",
						sentAt: new Date("2026-09-30T10:00:00Z"),
					}),
					inbound("rep@own.example", {
						direction: "OUTBOUND",
						subject: "Out of office: Angebot",
						recipients: ["preview@kunde.example"],
						sentAt: new Date("2026-10-01T10:00:00Z"),
					}),
				],
			},
			policy,
		);
		expect(plan.senders[0]?.lastMailAt).toEqual(
			new Date("2026-09-17T10:00:00Z"),
		);
		expect(plan.mail).toEqual([
			{ email: "preview@kunde.example", at: new Date("2026-09-17T10:00:00Z") },
		]);
	});

	it("dates mail on a thread it skips for creation", () => {
		const plan = planThread(
			{
				subject: null,
				company: null,
				messages: [inbound("preview@kunde.example")],
			},
			policy,
		);
		expect(plan.skip).toBe("no-company-domain");
		expect(plan.mail).toEqual([
			{ email: "preview@kunde.example", at: new Date("2026-09-17T10:00:00Z") },
		]);
	});

	it("marks a sender of a mailbox that creates nobody", () => {
		const plan = planThread(
			{
				subject: null,
				company,
				messages: [
					inbound("preview@kunde.example", { syncedByUserId: "user-2" }),
				],
			},
			policy,
		);
		expect(plan.senders[0]?.verdict).toBe("policy-off");
	});
});

describe("the thread contacts cursor", () => {
	it("reads what it writes", () => {
		const cursor = {
			v: 1 as const,
			at: "2026-09-17T10:00:00.000Z",
			id: "thread-1",
		};
		expect(
			readThreadContactsCursor(serialiseThreadContactsCursor(cursor)),
		).toEqual({ outcome: "ok", cursor });
	});

	it("reports an unreadable value and an empty one", () => {
		expect(readThreadContactsCursor(null)).toEqual({ outcome: "none" });
		expect(readThreadContactsCursor("{").outcome).toBe("unreadable");
		expect(readThreadContactsCursor('{"v":2}').outcome).toBe("unreadable");
	});
});
