import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db, FactBand, FactStatus } from "@crm/db";
import { sweepBlankFacts } from "../agent/lib/blank-facts";

const suffix = process.env.TEST_RUN_ID ?? "blank-facts-spec";
const email = `blank.subject.${suffix}@example.test`;
const strangerEmail = `a.keller.${suffix}@example.test`;

let contactId: string;

async function propose(input: {
	field: string;
	value: string;
	score: number;
	kind?: string;
}): Promise<string> {
	const fact = await db.contactFact.create({
		data: {
			contactId,
			field: input.field,
			value: input.value,
			score: input.score,
			band: input.score >= 0.55 ? FactBand.PROBABLE : FactBand.POSSIBLE,
			evidence: [
				{ kind: input.kind ?? "web.cited-claim", detail: "a page said so" },
			],
			method: "web",
			status: FactStatus.PROPOSED,
		},
		select: { id: true },
	});

	return fact.id;
}

function statusOf(id: string) {
	return db.contactFact
		.findUnique({ where: { id }, select: { status: true } })
		.then((fact) => fact?.status);
}

beforeEach(async () => {
	await db.contact.deleteMany({
		where: { email: { in: [email, strangerEmail] } },
	});
	const contact = await db.contact.create({
		data: { firstName: "Blank", lastName: "Subject", email },
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(async () => {
	await db.contact.deleteMany({
		where: { email: { in: [email, strangerEmail] } },
	});
});

describe("sweepBlankFacts", () => {
	it("fills an empty field from the best-evidenced suggestion", async () => {
		const weak = await propose({
			field: "linkedinUrl",
			value: "https://www.linkedin.com/in/maybe",
			score: 0.35,
		});
		const strong = await propose({
			field: "linkedinUrl",
			value: "https://www.linkedin.com/in/subject",
			score: 0.61,
		});

		const sweep = await sweepBlankFacts();

		expect(sweep.filled).toBe(1);
		expect(await statusOf(strong)).toBe("APPLIED");
		expect(await statusOf(weak)).toBe("SUPERSEDED");

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { linkedinUrl: true },
		});
		expect(contact?.linkedinUrl).toBe("https://www.linkedin.com/in/subject");
	});

	it("leaves a signature the sender wrote in front of a rep", async () => {
		const offer = await propose({
			field: "title",
			value: "Chief of Staff",
			score: 0.8,
			kind: "crm.signature-block",
		});

		const sweep = await sweepBlankFacts();

		expect(sweep.filled).toBe(0);
		expect(sweep.waiting).toBe(1);
		expect(await statusOf(offer)).toBe("PROPOSED");

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { title: true },
		});
		expect(contact?.title).toBeNull();
	});

	it("never fills a name from a source that names nobody", async () => {
		const stranger = await db.contact.create({
			data: { firstName: "A", lastName: "Keller", email: strangerEmail },
			select: { id: true },
		});

		const offer = await db.contactFact.create({
			data: {
				contactId: stranger.id,
				field: "name",
				value: "Anders Kellermann",
				score: 0.61,
				band: FactBand.PROBABLE,
				evidence: [
					{ kind: "web.cited-claim", detail: "a directory lists them" },
					{ kind: "search.cites-profile", detail: "a search returned it" },
				],
				method: "web",
				status: FactStatus.PROPOSED,
			},
			select: { id: true },
		});

		await sweepBlankFacts();

		expect(await statusOf(offer.id)).toBe("PROPOSED");

		const contact = await db.contact.findUnique({
			where: { id: stranger.id },
			select: { firstName: true },
		});
		expect(contact?.firstName).toBe("A");
	});

	it("leaves a suggestion that disagrees with what is already there", async () => {
		await db.contact.update({
			where: { id: contactId },
			data: { title: "Head of Security" },
		});

		const offer = await propose({
			field: "title",
			value: "VP Security",
			score: 0.61,
		});

		const sweep = await sweepBlankFacts();

		expect(sweep.filled).toBe(0);
		expect(sweep.waiting).toBe(1);
		expect(await statusOf(offer)).toBe("PROPOSED");
	});

	it("clears a suggestion that only repeats the record", async () => {
		await db.contact.update({
			where: { id: contactId },
			data: { title: "Head of Security" },
		});

		const echo = await propose({
			field: "title",
			value: "head of security",
			score: 0.61,
		});

		const sweep = await sweepBlankFacts();

		expect(sweep.settled).toBe(1);
		expect(sweep.waiting).toBe(0);
		expect(await statusOf(echo)).toBe("SUPERSEDED");
	});

	it("clears a suggestion that differs only by a trailing slash", async () => {
		await db.contact.update({
			where: { id: contactId },
			data: { linkedinUrl: "https://www.linkedin.com/in/pogrebs" },
		});

		const echo = await propose({
			field: "linkedinUrl",
			value: "https://www.linkedin.com/in/pogrebs/",
			score: 0.61,
		});

		const sweep = await sweepBlankFacts();

		expect(sweep.settled).toBe(1);
		expect(sweep.waiting).toBe(0);
		expect(await statusOf(echo)).toBe("SUPERSEDED");
	});

	it("keeps one of two suggestions offering the same value", async () => {
		await db.contact.update({
			where: { id: contactId },
			data: { title: "Head of Security" },
		});

		await propose({ field: "title", value: "VP Security", score: 0.61 });
		await propose({ field: "title", value: "VP Security", score: 0.61 });

		await sweepBlankFacts();

		const left = await db.contactFact.count({
			where: { contactId, field: "title", status: FactStatus.PROPOSED },
		});
		expect(left).toBe(1);
	});

	it("counts without writing when it is only reading", async () => {
		const offer = await propose({
			field: "githubUrl",
			value: "https://github.com/subject",
			score: 0.4,
		});

		const sweep = await sweepBlankFacts({ dry: true });

		expect(sweep.filled).toBe(1);
		expect(await statusOf(offer)).toBe("PROPOSED");

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { githubUrl: true },
		});
		expect(contact?.githubUrl).toBeNull();
	});
});
