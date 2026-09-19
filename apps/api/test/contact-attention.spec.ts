import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { readContactAttention } from "@crm/db/contact-attention";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";

const suffix = process.env.TEST_RUN_ID ?? "attention-spec";
const domain = `attention-${suffix}.test`;
const rep = `rep-${suffix}`;
const now = new Date(Date.UTC(2026, 5, 1));

const rules = {
	...DEFAULT_WIN_BACK_RULES,
	include: { ...DEFAULT_WIN_BACK_RULES.include, requireTopic: false },
};

function daysAgo(days: number, hour = 9): Date {
	return new Date(now.getTime() - days * 86_400_000 + hour * 3_600_000);
}

type Wire = { direction: EmailDirection; sentAt: Date };

async function person(
	firstName: string,
	wires: Wire[],
	insight: {
		relevant?: boolean;
		outcome: string;
		unansweredByUs: boolean;
		quantityPallets: number | null;
		loads: number | null;
		side: string | null;
		products: string[];
		topics: string[];
		evidence: string[];
	} | null,
): Promise<string> {
	const email = `${firstName.toLowerCase()}@${domain}`;
	const contact = await db.contact.create({
		data: { firstName, email, standing: "customer", potentialBand: "high" },
		select: { id: true },
	});

	const sorted = [...wires].sort(
		(a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
	);
	const first = sorted[0];
	const last = sorted.at(-1);
	if (!first || !last) return contact.id;

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `${firstName}-${suffix}@${domain}`,
			subject: `Bedarf Q4 ${firstName}`,
			contactId: contact.id,
			firstMessageAt: first.sentAt,
			lastMessageAt: last.sentAt,
			messageCount: sorted.length,
			messages: {
				create: sorted.map((wire, position) => ({
					rfcMessageId: `${firstName}-${position}-${suffix}@${domain}`,
					syncedByUserId: rep,
					direction: wire.direction,
					fromEmail:
						wire.direction === EmailDirection.OUTBOUND
							? `rep@${domain}`
							: email,
					recipients: [],
					subject: `Bedarf Q4 ${firstName}`,
					sentAt: wire.sentAt,
				})),
			},
		},
		select: { id: true },
	});

	if (insight) {
		await db.threadInsight.create({
			data: {
				threadId: thread.id,
				relevant: true,
				summary: "read by the agent",
				modelId: "test",
				lastMessageAt: last.sentAt,
				...insight,
			},
		});
		await db.contactMemory.create({
			data: {
				contactId: contact.id,
				summary: "read by the agent",
				didBusiness: 1,
				openInquiries: 1,
				maxPallets: insight.quantityPallets,
				products: insight.products,
				lastOutcome: insight.outcome,
				coveredThreadIds: [thread.id],
			},
		});
	}

	return contact.id;
}

const inbound = (days: number): Wire => ({
	direction: EmailDirection.INBOUND,
	sentAt: daysAgo(days),
});
const outbound = (days: number): Wire => ({
	direction: EmailDirection.OUTBOUND,
	sentAt: daysAgo(days, 12),
});

const OFFER = {
	outcome: "OPEN_OFFER_OURS",
	unansweredByUs: false,
	quantityPallets: 620,
	loads: 4,
	side: "THEY_BUY",
	products: ["Europalette EPAL"],
	topics: ["Abholfenster"],
	evidence: ["Wir brauchen 620 Stück, Klasse A, sortenrein."],
};

let waiting: string;
let owing: string;
let bare: string;
let quiet: string;

beforeAll(async () => {
	await db.user.createMany({
		data: [{ id: rep, name: "Rep", email: `${rep}@${domain}`, updatedAt: now }],
	});

	waiting = await person("Waiting", [inbound(13), outbound(8)], OFFER);
	owing = await person("Owing", [outbound(11), inbound(3)], {
		...OFFER,
		outcome: "OPEN_INQUIRY_THEIRS",
		unansweredByUs: true,
	});
	bare = await person("Bare", [inbound(2)], null);
	quiet = await person("Quiet", [inbound(244), outbound(241)], {
		...OFFER,
		outcome: "DEAL_DONE",
	});
});

afterAll(async () => {
	await db.contactMemory.deleteMany({
		where: { contact: { email: { endsWith: `@${domain}` } } },
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `@${domain}` } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.user.deleteMany({ where: { id: rep } });
});

function read(contactId: string) {
	return readContactAttention(db, { contactId, now, rules });
}

describe("readContactAttention picks the case from what the agent stored", () => {
	it("says you wait on them while your offer is out", async () => {
		const answer = await read(waiting);

		expect(answer.kind).toBe("waiting");
		expect(answer.quietDays).toBe(7);
		expect(answer.lastOutbound?.threadId).not.toBeNull();
		expect(answer.lastInbound?.threadId).not.toBeNull();
	});

	it("says you owe them an answer when their mail is the newest", async () => {
		const answer = await read(owing);

		expect(answer.kind).toBe("owed");
		expect(answer.fields.map((field) => field.key)).toContain("asked");
	});

	it("says nothing is known when no thread was read", async () => {
		const answer = await read(bare);

		expect(answer.kind).toBe("nothing-known");
		expect(answer.fields).toEqual([]);
		expect(answer.evidence).toBeNull();
		expect(answer.firstContactAt).not.toBeNull();
	});

	it("calls for a win back after months of silence, with the score table", async () => {
		const answer = await read(quiet);

		expect(answer.kind).toBe("win-back");
		expect(answer.points?.total).toBeGreaterThan(0);
		expect(answer.points?.lines.length).toBeGreaterThan(0);
	});

	it("says nothing is known for a contact with no mail at all", async () => {
		const stranger = await db.contact.create({
			data: { firstName: "Stranger", email: `stranger@${domain}` },
			select: { id: true },
		});

		expect((await read(stranger.id)).kind).toBe("nothing-known");
	});

	it("carries the thread behind every field read out of one thread", async () => {
		const answer = await read(waiting);

		for (const field of answer.fields) {
			if (
				field.key === "task" ||
				field.key === "bought" ||
				field.key === "standing"
			) {
				continue;
			}
			expect(field.source?.threadId).not.toBeUndefined();
		}
		expect(answer.evidence?.source.threadId).not.toBeUndefined();
	});

	it("knows nothing when every thread was read and judged irrelevant", async () => {
		const dismissed = await person("Dismissed", [inbound(6), outbound(5)], {
			...OFFER,
			relevant: false,
		});
		const answer = await read(dismissed);

		expect(answer.kind).toBe("nothing-known");
		expect(answer.fields).toEqual([]);
	});

	it("names the question from the older thread nobody answered", async () => {
		const asking = await person(
			"Asking",
			[inbound(20), outbound(19), inbound(2)],
			{ ...OFFER, outcome: "OPEN_INQUIRY_THEIRS" },
		);
		const older = await db.emailThread.create({
			data: {
				rootMessageId: `Asking-older-${suffix}@${domain}`,
				subject: "Restposten Gitterbox",
				contactId: asking,
				firstMessageAt: daysAgo(240),
				lastMessageAt: daysAgo(238),
				messageCount: 1,
				messages: {
					create: [
						{
							rfcMessageId: `Asking-older-0-${suffix}@${domain}`,
							syncedByUserId: rep,
							direction: EmailDirection.INBOUND,
							fromEmail: `asking@${domain}`,
							recipients: [],
							subject: "Restposten Gitterbox",
							sentAt: daysAgo(238),
						},
					],
				},
				insight: {
					create: {
						relevant: true,
						summary: "read by the agent",
						modelId: "test",
						lastMessageAt: daysAgo(238),
						outcome: "OPEN_INQUIRY_THEIRS",
						unansweredByUs: true,
						quantityPallets: null,
						loads: null,
						side: "THEY_BUY",
						products: [],
						topics: ["Restposten Gitterbox"],
						evidence: [],
					},
				},
			},
			select: { id: true },
		});

		const answer = await read(asking);
		const asked = answer.fields.find((field) => field.key === "asked");

		expect(answer.kind).toBe("owed");
		expect(asked?.key === "asked" ? asked.values : []).toEqual([
			"Restposten Gitterbox",
		]);
		expect(asked?.key === "asked" ? asked.source?.threadId : null).toBe(
			older.id,
		);
	});

	it("names why the standing holds instead of linking to one thread", async () => {
		const answer = await read(waiting);
		const standing = answer.fields.find((field) => field.key === "standing");

		expect(standing?.key).toBe("standing");
		if (standing?.key !== "standing") return;
		expect(standing.threadsRead).toBe(1);
		expect(standing.worth).not.toBeNull();
	});
});
