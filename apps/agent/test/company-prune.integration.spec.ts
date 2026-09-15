import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { pruneCompanies } from "../agent/lib/contact-prune";

const suffix = process.env.TEST_RUN_ID ?? "company-prune-spec";
const domain = `prune-${suffix}.example.test`;
const ownerId = `owner-${suffix}`;

async function makeCompany(input: { source?: RecordSource }): Promise<string> {
	const company = await db.company.create({
		data: {
			name: domain,
			domain,
			source: input.source ?? RecordSource.EMAIL,
		},
		select: { id: true },
	});

	return company.id;
}

async function makeContact(input: {
	companyId: string;
	archived: boolean;
}): Promise<string> {
	const contact = await db.contact.create({
		data: {
			firstName: "Prune",
			lastName: "Subject",
			email: `person.${crypto.randomUUID()}@${domain}`,
			companyId: input.companyId,
			source: RecordSource.EMAIL,
			archivedAt: input.archived ? new Date() : null,
		},
		select: { id: true },
	});

	return contact.id;
}

function archivedAtOf(id: string) {
	return db.company
		.findUnique({ where: { id }, select: { archivedAt: true } })
		.then((company) => company?.archivedAt ?? null);
}

async function owner(): Promise<void> {
	await db.user.upsert({
		where: { id: ownerId },
		update: {},
		create: {
			id: ownerId,
			name: "Prune Owner",
			email: `owner.${suffix}@${domain}`,
		},
	});
}

async function clean(): Promise<void> {
	await db.deal.deleteMany({ where: { company: { domain } } });
	await db.contact.deleteMany({ where: { company: { domain } } });
	await db.company.deleteMany({ where: { domain } });
}

beforeEach(async () => {
	await clean();
	await owner();
});

afterEach(async () => {
	await clean();
	await db.user.deleteMany({ where: { id: ownerId } });
});

describe("pruneCompanies", () => {
	it("archives a company whose contacts are all archived", async () => {
		const companyId = await makeCompany({});
		await makeContact({ companyId, archived: true });

		await pruneCompanies();

		expect(await archivedAtOf(companyId)).not.toBeNull();
	});

	it("keeps a company with one live contact", async () => {
		const companyId = await makeCompany({});
		await makeContact({ companyId, archived: true });
		await makeContact({ companyId, archived: false });

		await pruneCompanies();

		expect(await archivedAtOf(companyId)).toBeNull();
	});

	it("keeps a company that has a deal", async () => {
		const companyId = await makeCompany({});
		await makeContact({ companyId, archived: true });
		await db.deal.create({
			data: { name: `Deal ${domain}`, companyId, ownerId },
		});

		await pruneCompanies();

		expect(await archivedAtOf(companyId)).toBeNull();
	});

	it("keeps a company somebody typed in", async () => {
		const companyId = await makeCompany({ source: RecordSource.MANUAL });
		await makeContact({ companyId, archived: true });

		await pruneCompanies();

		expect(await archivedAtOf(companyId)).toBeNull();
	});
});
