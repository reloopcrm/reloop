import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { writeWinBackRulesState } from "@crm/validation/win-back-rules";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ReactivationService } from "../src/reactivation/reactivation.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-feedback-spec";
const domain = `verdict-${suffix}.test`;
const userId = `user-${suffix}`;

let tunes = 0;

const agent = {
	rulesTuneRequested: async () => {
		tunes += 1;
		return true;
	},
} as unknown as AgentTriggerService;

const service = new ReactivationService(db, agent);

async function people(count: number): Promise<string[]> {
	const ids: string[] = [];

	for (let index = 0; index < count; index += 1) {
		const contact = await db.contact.create({
			data: {
				firstName: `Person ${index}`,
				email: `person.${index}@${domain}`,
			},
			select: { id: true },
		});
		ids.push(contact.id);
	}

	return ids;
}

function verdicts(ids: string[]) {
	return db.potentialFeedback.count({
		where: { contactId: { in: ids }, verdict: "bad" },
	});
}

const archivedOn = new Date("2026-09-01T00:00:00Z");

async function archivedCompany(
	name: string,
	source: RecordSource = RecordSource.EMAIL,
): Promise<string> {
	const company = await db.company.create({
		data: {
			name,
			domain,
			source,
			archivedAt: archivedOn,
		},
		select: { id: true },
	});

	return company.id;
}

async function archivedPerson(
	local: string,
	options: { companyId: string; verdict?: string },
): Promise<string> {
	const contact = await db.contact.create({
		data: {
			firstName: local,
			email: `${local}@${domain}`,
			source: RecordSource.EMAIL,
			companyId: options.companyId,
			archivedAt: archivedOn,
		},
		select: { id: true },
	});

	if (options.verdict) {
		await db.potentialFeedback.create({
			data: { contactId: contact.id, verdict: options.verdict, userId },
		});
	}

	return contact.id;
}

function contactArchivedAt(id: string) {
	return db.contact
		.findUnique({ where: { id }, select: { archivedAt: true } })
		.then((contact) => contact?.archivedAt ?? null);
}

function companyArchivedAt(id: string) {
	return db.company
		.findUnique({ where: { id }, select: { archivedAt: true } })
		.then((company) => company?.archivedAt ?? null);
}

async function clean() {
	await db.contact.deleteMany({
		where: {
			OR: [{ email: { endsWith: `@${domain}` } }, { company: { domain } }],
		},
	});
	await db.company.deleteMany({ where: { domain } });
}

beforeEach(async () => {
	await clean();
	await writeWinBackRulesState(db, { mode: "auto" });
	tunes = 0;
});

afterEach(clean);

describe("one verdict for a whole company", () => {
	it("writes a row for every person and tunes the rules once", async () => {
		const ids = await people(3);

		const saved = await service.setFeedback(userId, {
			contactIds: ids,
			verdict: "bad",
		});

		expect(saved.verdict).toBe("bad");
		expect(saved.contactIds).toHaveLength(3);
		expect(await verdicts(ids)).toBe(3);
		expect(tunes).toBe(1);
	});

	it("takes the verdict off every person again", async () => {
		const ids = await people(3);
		await service.setFeedback(userId, { contactIds: ids, verdict: "bad" });

		const removed = await service.setFeedback(userId, {
			contactIds: ids,
			verdict: null,
		});

		expect(removed.verdict).toBeNull();
		expect(await verdicts(ids)).toBe(0);
	});

	it("counts a person named twice only once", async () => {
		const ids = await people(1);
		const id = ids[0] as string;

		const saved = await service.setFeedback(userId, {
			contactIds: [id, id],
			verdict: "bad",
		});

		expect(saved.contactIds).toEqual([id]);
		expect(await verdicts(ids)).toBe(1);
	});
});

describe("taking a bad verdict back", () => {
	it("brings the person and their company back", async () => {
		const companyId = await archivedCompany("Alte Firma");
		const id = await archivedPerson("zurueck", { companyId, verdict: "bad" });

		await service.setFeedback(userId, { contactIds: [id], verdict: null });

		expect(await contactArchivedAt(id)).toBeNull();
		expect(await companyArchivedAt(companyId)).toBeNull();
		expect(await verdicts([id])).toBe(0);
	});

	it("leaves a person archived for another reason alone", async () => {
		const companyId = await archivedCompany("Andere Firma");
		const id = await archivedPerson("ohnegrund", { companyId });

		await service.setFeedback(userId, { contactIds: [id], verdict: null });

		expect(await contactArchivedAt(id)).toEqual(archivedOn);
		expect(await companyArchivedAt(companyId)).toEqual(archivedOn);
	});

	it("brings the person back every time the verdict comes off", async () => {
		const companyId = await archivedCompany("Zweite Firma");
		const id = await archivedPerson("zweimal", { companyId, verdict: "bad" });

		await service.setFeedback(userId, { contactIds: [id], verdict: null });

		expect(await contactArchivedAt(id)).toBeNull();
		expect(await companyArchivedAt(companyId)).toBeNull();
		expect(await verdicts([id])).toBe(0);

		const again = new Date("2026-09-05T00:00:00Z");
		await db.contact.update({ where: { id }, data: { archivedAt: again } });
		await db.company.update({
			where: { id: companyId },
			data: { archivedAt: again },
		});
		await db.potentialFeedback.create({
			data: { contactId: id, verdict: "bad", userId },
		});

		await service.setFeedback(userId, { contactIds: [id], verdict: null });

		expect(await contactArchivedAt(id)).toBeNull();
		expect(await companyArchivedAt(companyId)).toBeNull();
		expect(await verdicts([id])).toBe(0);
	});

	it("leaves the company alone when the person is not archived", async () => {
		const companyId = await archivedCompany("Dritte Firma");
		const contact = await db.contact.create({
			data: {
				firstName: "Ohne Adresse",
				source: RecordSource.EMAIL,
				companyId,
			},
			select: { id: true },
		});
		await db.potentialFeedback.create({
			data: { contactId: contact.id, verdict: "bad", userId },
		});

		await service.setFeedback(userId, {
			contactIds: [contact.id],
			verdict: null,
		});

		expect(await contactArchivedAt(contact.id)).toBeNull();
		expect(await companyArchivedAt(companyId)).toEqual(archivedOn);
		expect(await verdicts([contact.id])).toBe(0);
	});

	it("leaves a company the rep archived by hand alone", async () => {
		const companyId = await archivedCompany("Handarbeit", RecordSource.MANUAL);
		const id = await archivedPerson("vonhand", { companyId, verdict: "bad" });

		await service.setFeedback(userId, { contactIds: [id], verdict: null });

		expect(await contactArchivedAt(id)).toBeNull();
		expect(await companyArchivedAt(companyId)).toEqual(archivedOn);
	});

	it("leaves the person archived when a live contact holds the address", async () => {
		const companyId = await archivedCompany("Vierte Firma");
		const id = await archivedPerson("doppelt", { companyId, verdict: "bad" });

		await db.contact.create({
			data: { firstName: "Doppelt live", email: `doppelt@${domain}` },
			select: { id: true },
		});

		await service.setFeedback(userId, { contactIds: [id], verdict: null });

		expect(await contactArchivedAt(id)).toEqual(archivedOn);
		expect(await companyArchivedAt(companyId)).toEqual(archivedOn);
		expect(await verdicts([id])).toBe(0);
	});
});
