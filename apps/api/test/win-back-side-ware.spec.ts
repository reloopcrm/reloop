import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { listReactivationCandidates } from "@crm/db/reactivation";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";

const suffix = process.env.TEST_RUN_ID ?? "side-ware-spec";
const domain = `sideware-${suffix}.test`;
const rep = `side-rep-${suffix}`;
const now = new Date(Date.UTC(2026, 5, 1));

const rules = {
	...DEFAULT_WIN_BACK_RULES,
	include: { ...DEFAULT_WIN_BACK_RULES.include, requireTopic: false },
	business: {
		...DEFAULT_WIN_BACK_RULES.business,
		products: ["Europalette", "EPAL", "Palette", "Gitterbox"],
		sideProducts: ["CP-Palette", "CP1", "CP2", "CP3", "Einwegpalette"],
		minPallets: 400,
		minBoxes: 15,
		boxProducts: ["Gitterbox", "Gitterboxen", "Lagerbox"],
	},
};

async function person(name: string, products: string[]): Promise<string> {
	const email = `${name.toLowerCase()}@${domain}`;
	const contact = await db.contact.create({
		data: { firstName: name, email, ownerId: rep },
		select: { id: true },
	});

	const at = new Date(now.getTime() - 90 * 86_400_000);

	await db.emailThread.create({
		data: {
			rootMessageId: `${name}-${suffix}@${domain}`,
			subject: "Paletten",
			contactId: contact.id,
			firstMessageAt: at,
			lastMessageAt: at,
			messageCount: 1,
			messages: {
				create: [
					{
						rfcMessageId: `${name}-0-${suffix}@${domain}`,
						syncedByUserId: rep,
						direction: EmailDirection.INBOUND,
						fromEmail: email,
						recipients: [],
						subject: "Paletten",
						sentAt: at,
					},
				],
			},
		},
	});

	await db.contactMemory.create({
		data: {
			contactId: contact.id,
			summary: `${name} handelt mit ${products.join(", ")}.`,
			products,
			didBusiness: 0,
			openInquiries: 0,
			coveredThreadIds: [],
		},
	});

	return contact.id;
}

async function listMine() {
	const report = await listReactivationCandidates(db, {
		rules,
		now,
		quietForDays: 30,
		limit: 50,
		ownerId: rep,
	});

	return report.candidates;
}

async function pointsFor(contactId: string, label: string): Promise<number> {
	const candidates = await listMine();
	const row = candidates.find(
		(candidate) => candidate.contact.id === contactId,
	);
	const line = row?.pointLines.find((entry) => entry.label === label);

	return line?.points ?? 0;
}

const MAIN = "Talks about {products}";
const SIDE = "Talks about side ware: {products}";

let euro: string;
let cp: string;
let both: string;

beforeAll(async () => {
	await db.user.createMany({
		data: [{ id: rep, name: "Rep", email: `${rep}@${domain}`, updatedAt: now }],
	});

	euro = await person("Euro", ["Europaletten", "unsortierte Europaletten"]);
	cp = await person("Cp", ["CP3-Paletten", "Einwegpaletten"]);
	both = await person("Both", ["Europaletten", "CP1-Paletten"]);
});

afterAll(async () => {
	const people = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = people.map((row) => row.id);

	await db.contactMemory.deleteMany({ where: { contactId: { in: ids } } });
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `@${domain}` } },
	});
	await db.contact.deleteMany({ where: { id: { in: ids } } });
	await db.user.deleteMany({ where: { id: rep } });
});

describe("side ware scores below the main ware", () => {
	it("gives a Europalette contact the full product points", async () => {
		expect(await pointsFor(euro, MAIN)).toBe(rules.points.productMatch);
		expect(await pointsFor(euro, SIDE)).toBe(0);
	});

	it("gives a CP and one-way contact the lower side points", async () => {
		expect(await pointsFor(cp, SIDE)).toBe(rules.points.sideProductMatch);
		expect(await pointsFor(cp, MAIN)).toBe(0);
	});

	it("keeps the full points when the contact also trades the main ware", async () => {
		expect(await pointsFor(both, MAIN)).toBe(rules.points.productMatch);
		expect(await pointsFor(both, SIDE)).toBe(0);
	});

	it("still lists the side ware contact", async () => {
		const candidates = await listMine();

		expect(candidates.map((candidate) => candidate.contact.id)).toContain(cp);
	});
});
