import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { CompaniesService } from "../src/companies/companies.service";

const suffix = process.env.TEST_RUN_ID ?? "primary-contact-spec";
const domain = `primary-${suffix}.test`;

type CompanyDeps = ConstructorParameters<typeof CompaniesService>;

const unused = {} as never;

const service = new CompaniesService(
	db,
	{ companyRequested: async () => true } as unknown as CompanyDeps[1],
	unused,
	unused,
	unused,
	unused,
	unused,
);

async function company(): Promise<string> {
	const row = await db.company.create({
		data: { name: domain, domain, source: RecordSource.EMAIL },
		select: { id: true },
	});
	return row.id;
}

async function person(companyId: string, local: string): Promise<string> {
	const row = await db.contact.create({
		data: {
			firstName: local,
			email: `${local}@${domain}`,
			companyId,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	return row.id;
}

async function clean(): Promise<void> {
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
}

beforeEach(clean);
afterEach(clean);

describe("choosing the primary contact", () => {
	it("takes the mark off again", async () => {
		const companyId = await company();
		const contactId = await person(companyId, "ada");

		const set = await service.setPrimaryContact(companyId, contactId);
		expect(set.primaryContactId).toBe(contactId);

		const cleared = await service.setPrimaryContact(companyId, null);
		expect(cleared.primaryContactId).toBeNull();
	});

	it("moves the mark to somebody else", async () => {
		const companyId = await company();
		const first = await person(companyId, "ada");
		const second = await person(companyId, "bruno");

		await service.setPrimaryContact(companyId, first);
		const moved = await service.setPrimaryContact(companyId, second);

		expect(moved.primaryContactId).toBe(second);
	});

	it("clearing twice is harmless", async () => {
		const companyId = await company();
		await service.setPrimaryContact(companyId, null);
		const again = await service.setPrimaryContact(companyId, null);

		expect(again.primaryContactId).toBeNull();
	});
});
