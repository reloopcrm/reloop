import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { readContactAttention } from "@crm/db/contact-attention";
import { DECLINE_KIND, type DeclineKind } from "@crm/db/insights";
import { listReactivationCandidates, REACTIVATION } from "@crm/db/reactivation";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { WinBackPersonService } from "../src/reactivation/win-back-person.service";
import type { WinBackStoryPrefetchService } from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-hard-no-spec";
const domain = `hard-no-${suffix}.test`;
const now = new Date(Date.UTC(2026, 5, 1));

function daysAgo(days: number, hour = 9): Date {
	return new Date(now.getTime() - days * 86_400_000 + hour * 3_600_000);
}

type Wire = {
	direction: EmailDirection;
	sentAt: Date;
	from?: string;
	subject?: string;
};

const inbound = (days: number): Wire => ({
	direction: EmailDirection.INBOUND,
	sentAt: daysAgo(days),
});
const colleague = (days: number): Wire => ({
	direction: EmailDirection.INBOUND,
	sentAt: daysAgo(days),
	from: `colleague@${domain}`,
});
const autoReply = (days: number): Wire => ({
	direction: EmailDirection.INBOUND,
	sentAt: daysAgo(days),
	subject: "Automatische Antwort: Europaletten",
});
const outbound = (days: number): Wire => ({
	direction: EmailDirection.OUTBOUND,
	sentAt: daysAgo(days, 12),
});

type Decline = { declineKind: DeclineKind | null } | null;

async function thread(
	contactId: string,
	name: string,
	index: number,
	wires: Wire[],
	decline: Decline,
): Promise<string> {
	const email = `${name.toLowerCase()}@${domain}`;
	const sorted = [...wires].sort(
		(a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
	);
	const first = sorted[0];
	const last = sorted.at(-1);
	if (!first || !last) throw new Error("a thread needs mail");

	const created = await db.emailThread.create({
		data: {
			rootMessageId: `${name}-${index}-${suffix}@${domain}`,
			subject: `${name} ${index}`,
			contactId,
			firstMessageAt: first.sentAt,
			lastMessageAt: last.sentAt,
			messageCount: sorted.length,
			messages: {
				create: sorted.map((wire, position) => ({
					rfcMessageId: `${name}-${index}-${position}-${suffix}@${domain}`,
					direction: wire.direction,
					fromEmail:
						wire.from ??
						(wire.direction === EmailDirection.OUTBOUND
							? `rep@${domain}`
							: email),
					recipients: [],
					subject: wire.subject ?? `${name} ${index}`,
					sentAt: wire.sentAt,
				})),
			},
		},
		select: { id: true },
	});

	if (decline) {
		const declinedAt = sorted.findLast(
			(wire) => wire.direction === EmailDirection.INBOUND && !wire.from,
		)?.sentAt;
		await db.threadInsight.create({
			data: {
				threadId: created.id,
				relevant: true,
				topics: ["Europaletten"],
				products: ["Europaletten"],
				outcome: "DECLINED",
				declineKind: decline.declineKind,
				declinedAt:
					decline.declineKind === DECLINE_KIND.hard ? declinedAt : null,
				summary: "Sie haben abgelehnt.",
				evidence: [],
				modelId: "test-model",
				lastMessageAt: last.sentAt,
			},
		});
	}

	return created.id;
}

async function person(
	name: string,
	threads: { wires: Wire[]; decline: Decline }[],
): Promise<string> {
	const contact = await db.contact.create({
		data: {
			firstName: name,
			lastName: "Probe",
			email: `${name.toLowerCase()}@${domain}`,
		},
		select: { id: true },
	});

	const ids: string[] = [];
	for (const [index, entry] of threads.entries()) {
		ids.push(await thread(contact.id, name, index, entry.wires, entry.decline));
	}

	await db.contactMemory.create({
		data: {
			contactId: contact.id,
			summary: "Hat Europaletten angefragt.",
			coveredThreadIds: ids,
			lastOutcome: "DECLINED",
		},
	});

	return contact.id;
}

const hard: Decline = { declineKind: DECLINE_KIND.hard };
const soft: Decline = { declineKind: DECLINE_KIND.soft };
const unknown: Decline = { declineKind: null };

let anna: string;
let berta: string;
let clara: string;
let dora: string;
let emil: string;
let fritz: string;
let gina: string;
let hans: string;

async function clean(): Promise<void> {
	const contacts = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = contacts.map((row) => row.id);
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
	await clean();
	anna = await person("Anna", [
		{ wires: [outbound(130), inbound(120)], decline: unknown },
	]);
	berta = await person("Berta", [
		{ wires: [outbound(130), inbound(120)], decline: hard },
	]);
	clara = await person("Clara", [
		{ wires: [inbound(140), outbound(130), inbound(120)], decline: soft },
	]);
	dora = await person("Dora", [
		{ wires: [outbound(130), inbound(120)], decline: hard },
		{ wires: [inbound(100)], decline: null },
	]);
	emil = await person("Emil", [
		{ wires: [outbound(130), inbound(120)], decline: hard },
		{ wires: [outbound(100)], decline: null },
	]);
	fritz = await person("Fritz", [
		{ wires: [outbound(130), inbound(120), outbound(60)], decline: hard },
		{ wires: [inbound(100)], decline: null },
	]);
	gina = await person("Gina", [
		{ wires: [outbound(130), inbound(120)], decline: hard },
		{ wires: [colleague(100)], decline: null },
	]);
	hans = await person("Hans", [
		{ wires: [outbound(130), inbound(120)], decline: hard },
		{ wires: [autoReply(100)], decline: null },
	]);
});

afterAll(clean);

async function listed(): Promise<string[]> {
	const report = await listReactivationCandidates(db, {
		now,
		limit: REACTIVATION.limit.max,
		rules: DEFAULT_WIN_BACK_RULES,
	});

	return report.groups.flatMap((group) =>
		group.people.map((candidate) => candidate.contact.id),
	);
}

describe("a hard no in Win back", () => {
	it("hides a person who declined without showing interest first", async () => {
		expect(await listed()).not.toContain(berta);
	});

	it("keeps hiding the person after a mail from us alone", async () => {
		expect(await listed()).not.toContain(emil);
	});

	it("keeps a soft no in the list with the declined hint", async () => {
		expect(await listed()).toContain(clara);

		const attention = await readContactAttention(db, {
			contactId: clara,
			now,
		});
		expect(attention.kind).toBe("declined");
	});

	it("keeps a decline read before the distinction existed", async () => {
		expect(await listed()).toContain(anna);
	});

	it("brings the person back when they write again on their own", async () => {
		expect(await listed()).toContain(dora);
	});

	it("dates the no by their mail, so a later mail from us does not hide them again", async () => {
		expect(await listed()).toContain(fritz);
	});

	it("needs mail from the person, not from a colleague in the thread", async () => {
		expect(await listed()).not.toContain(gina);
	});

	it("does not count an automatic reply as writing again", async () => {
		expect(await listed()).not.toContain(hans);
	});

	it("never continues with a hard no", async () => {
		const prefetch = {
			nextShown: () => undefined,
		} as unknown as WinBackStoryPrefetchService;
		const service = new WinBackPersonService(
			db,
			{} as AgentTriggerService,
			prefetch,
		);

		const next = await service.next("nobody", {
			contactId: anna,
			rejected: false,
			replied: false,
			quietForDays: 0,
			scope: "everyone",
			q: domain,
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 25,
			potential: [],
		});

		expect(next.next).toEqual({ id: clara, name: "Clara Probe" });
	});
});
