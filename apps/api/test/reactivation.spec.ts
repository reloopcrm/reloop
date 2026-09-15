import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db, EmailDirection } from "@crm/db";
import { listReactivationCandidates } from "@crm/db/reactivation";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";

const suffix = process.env.TEST_RUN_ID ?? "reactivation-spec";
const domain = `winback-${suffix}.test`;
const rep = `rep-${suffix}`;
const otherRep = `other-rep-${suffix}`;
const now = new Date(Date.UTC(2026, 5, 1));

function daysAgo(days: number, hour = 9): Date {
	return new Date(now.getTime() - days * 86_400_000 + hour * 3_600_000);
}

type Wire = { direction: EmailDirection; sentAt: Date };

async function person(
	firstName: string,
	ownerId: string,
	threads: Wire[][],
	options: { companyId?: string; deal?: DealStage } = {},
): Promise<string> {
	const email = `${firstName.toLowerCase()}@${domain}`;
	const contact = await db.contact.create({
		data: { firstName, email, ownerId, companyId: options.companyId },
		select: { id: true },
	});

	for (const [index, messages] of threads.entries()) {
		const sorted = [...messages].sort(
			(a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
		);
		const first = sorted[0];
		const last = sorted.at(-1);
		if (!first || !last) continue;

		await db.emailThread.create({
			data: {
				rootMessageId: `${firstName}-${index}-${suffix}@${domain}`,
				subject: `Thread ${index}`,
				contactId: contact.id,
				companyId: options.companyId,
				firstMessageAt: first.sentAt,
				lastMessageAt: last.sentAt,
				messageCount: sorted.length,
				messages: {
					create: sorted.map((message, position) => ({
						rfcMessageId: `${firstName}-${index}-${position}-${suffix}@${domain}`,
						syncedByUserId: ownerId,
						direction: message.direction,
						fromEmail:
							message.direction === EmailDirection.OUTBOUND
								? `rep@${domain}`
								: email,
						recipients: [],
						subject: `Thread ${index}`,
						sentAt: message.sentAt,
					})),
				},
			},
		});
	}

	if (options.deal && options.companyId) {
		await db.deal.create({
			data: {
				name: `${firstName} deal`,
				companyId: options.companyId,
				ownerId,
				stage: options.deal,
				contacts: { create: { contactId: contact.id } },
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

const rules = {
	...DEFAULT_WIN_BACK_RULES,
	include: { ...DEFAULT_WIN_BACK_RULES.include, requireTopic: false },
};

let companyId: string;
let waiting: string;
let heavy: string;
let recent: string;

beforeAll(async () => {
	await db.user.createMany({
		data: [
			{ id: rep, name: "Rep", email: `${rep}@${domain}`, updatedAt: now },
			{
				id: otherRep,
				name: "Other",
				email: `${otherRep}@${domain}`,
				updatedAt: now,
			},
		],
	});
	const company = await db.company.create({
		data: { name: "Winback Co", domain },
		select: { id: true },
	});
	companyId = company.id;

	waiting = await person("Waiting", rep, [[outbound(80), inbound(70)]]);
	heavy = await person(
		"Heavy",
		rep,
		[
			[inbound(120), outbound(119), inbound(118), outbound(100)],
			[inbound(96), outbound(94)],
		],
		{ companyId, deal: DealStage.CLOSED_WON },
	);
	recent = await person("Recent", rep, [[outbound(5), inbound(3)]]);
	await person("Never", otherRep, [[inbound(200), inbound(150)]]);
	await person("Theirs", otherRep, [[inbound(61), outbound(60)]]);
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { company: { domain } } });
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `@${domain}` } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: { in: [rep, otherRep] } } });
});

describe("listReactivationCandidates", () => {
	it("ranks quiet people by the configured points and explains each score", async () => {
		const report = await listReactivationCandidates(db, {
			quietForDays: 30,
			now,
			limit: 50,
			rules,
		});

		const mine = report.candidates.filter((candidate) =>
			candidate.contact.email?.endsWith(`@${domain}`),
		);

		expect(
			mine.map((candidate) => [candidate.contact.firstName, candidate.points]),
		).toEqual([
			["Heavy", 31],
			["Waiting", 12],
			["Never", 12],
			["Theirs", 2],
		]);

		const top = mine[0];
		expect(top?.contact.id).toBe(heavy);
		expect(top?.waitingOnUs).toBe(false);
		expect(top?.threads).toBe(2);
		expect(top?.wonDeals).toBe(1);
		expect(top?.contact.company?.id).toBe(companyId);
		expect(top?.pointLines).toEqual([
			{ label: "{n} emails from them", points: 3, vars: { n: 3 } },
			{ label: "{n} emails from you", points: 3, vars: { n: 3 } },
			{ label: "{n} won deal", points: 20, vars: { n: 1 } },
			{ label: "Has a company", points: 5, vars: undefined },
		]);

		const second = mine[1];
		expect(second?.contact.id).toBe(waiting);
		expect(second?.waitingOnUs).toBe(true);
		expect(second?.quietDays).toBe(69);
		expect(second?.reasons[0]).toBe(
			"Their last message never got a reply from you.",
		);

		expect(mine[2]?.messagesFromUs).toBe(0);
		expect(mine[2]?.reasons[0]).toBe(
			"Their last message never got a reply from you.",
		);
	});

	it("applies the include filters and keyword points from the rules", async () => {
		const strict = await listReactivationCandidates(db, {
			quietForDays: 30,
			now,
			rules: {
				...rules,
				include: { ...rules.include, neverReplied: false },
			},
		});

		expect(
			strict.candidates
				.filter((candidate) => candidate.contact.email?.endsWith(`@${domain}`))
				.map((candidate) => candidate.contact.firstName),
		).toEqual(["Heavy", "Waiting", "Theirs"]);

		const dealsOnly = await listReactivationCandidates(db, {
			quietForDays: 30,
			now,
			rules: {
				...rules,
				include: { ...rules.include, requireDeal: true },
				excludedDomains: [],
			},
		});

		expect(
			dealsOnly.candidates
				.filter((candidate) => candidate.contact.email?.endsWith(`@${domain}`))
				.map((candidate) => candidate.contact.id),
		).toEqual([heavy]);

		const excluded = await listReactivationCandidates(db, {
			quietForDays: 30,
			now,
			rules: { ...rules, excludedDomains: [domain] },
		});

		expect(
			excluded.candidates.some((candidate) =>
				candidate.contact.email?.endsWith(`@${domain}`),
			),
		).toBe(false);
	});

	it("respects the quiet window and the owner filter", async () => {
		const wide = await listReactivationCandidates(db, {
			quietForDays: 1,
			now,
			ownerId: rep,
			rules,
		});

		expect(
			wide.candidates.map((candidate) => candidate.contact.id).sort(),
		).toEqual([heavy, recent, waiting].sort());

		const narrow = await listReactivationCandidates(db, {
			quietForDays: 90,
			now,
			ownerId: rep,
			rules,
		});

		expect(narrow.candidates.map((candidate) => candidate.contact.id)).toEqual([
			heavy,
		]);
	});
});

describe("a company and the verdicts on its people", () => {
	async function groupOfCompany() {
		const report = await listReactivationCandidates(db, {
			quietForDays: 30,
			now,
			ownerId: rep,
			rules,
		});

		return report.groups.find((group) => group.company?.id === companyId);
	}

	it("keeps the colleagues when one person is out, and drops the company when nobody is left", async () => {
		const mate = await person(
			"Mate",
			rep,
			[[inbound(120), outbound(119), inbound(118)]],
			{ companyId },
		);

		expect((await groupOfCompany())?.people).toHaveLength(2);

		await db.potentialFeedback.create({
			data: { contactId: mate, verdict: "bad" },
		});

		const left = await groupOfCompany();
		expect(left?.people).toHaveLength(1);
		expect(left?.people[0]?.contact.id).toBe(heavy);

		await db.potentialFeedback.create({
			data: { contactId: heavy, verdict: "bad" },
		});

		expect(await groupOfCompany()).toBeUndefined();

		await db.potentialFeedback.deleteMany({
			where: { contactId: { in: [mate, heavy] } },
		});
		await db.emailThread.deleteMany({
			where: { rootMessageId: { startsWith: "Mate-" } },
		});
		await db.contact.deleteMany({ where: { id: mate } });

		expect((await groupOfCompany())?.people).toHaveLength(1);
	});
});

describe("the rejected view", () => {
	it("hides a bad verdict from the normal list and shows it in the rejected one", async () => {
		await db.potentialFeedback.create({
			data: { contactId: heavy, verdict: "bad" },
		});

		const normal = await listReactivationCandidates(db, {
			quietForDays: 30,
			now,
			limit: 50,
			rules,
		});
		const rejected = await listReactivationCandidates(db, {
			rejected: true,
			quietForDays: 30,
			now,
			limit: 50,
			rules,
		});

		expect(
			normal.candidates.some((candidate) => candidate.contact.id === heavy),
		).toBe(false);
		expect(
			rejected.candidates.some((candidate) => candidate.contact.id === heavy),
		).toBe(true);

		await db.potentialFeedback.deleteMany({ where: { contactId: heavy } });
	});

	it("shows nobody in the rejected view while no verdict is bad", async () => {
		const rejected = await listReactivationCandidates(db, {
			rejected: true,
			quietForDays: 30,
			now,
			limit: 50,
			rules,
		});

		const mine = rejected.candidates.filter((candidate) =>
			candidate.contact.email?.endsWith(`@${domain}`),
		);

		expect(mine).toHaveLength(0);
	});

	it("still finds a rejected person after the agent archived them", async () => {
		await db.potentialFeedback.create({
			data: { contactId: heavy, verdict: "bad" },
		});
		await db.contact.update({
			where: { id: heavy },
			data: { archivedAt: new Date() },
		});

		const rejected = await listReactivationCandidates(db, {
			rejected: true,
			quietForDays: 30,
			now,
			limit: 50,
			rules,
		});

		expect(
			rejected.candidates.some((candidate) => candidate.contact.id === heavy),
		).toBe(true);

		await db.contact.update({
			where: { id: heavy },
			data: { archivedAt: null },
		});
		await db.potentialFeedback.deleteMany({ where: { contactId: heavy } });
	});
});
