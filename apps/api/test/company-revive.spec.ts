import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "company-revive-spec";
const domain = `revive-${suffix}.test`;
const userId = `user-${suffix}`;
const mailbox = `rep-${suffix}@example.test`;

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	threadStored: async () => undefined,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);

const context = {
	ourAddresses: new Set([mailbox]),
	ourDomains: new Set(["example.test"]),
	suppressedDomains: new Set<string>(),
	suppressedEmails: new Set<string>(),
};

function archivedCompany(name: string) {
	return db.company.create({
		data: {
			name,
			domain,
			source: RecordSource.EMAIL,
			archivedAt: new Date("2026-09-01T00:00:00Z"),
		},
		select: { id: true },
	});
}

function archivedAtOf(id: string) {
	return db.company
		.findUnique({ where: { id }, select: { archivedAt: true } })
		.then((company) => company?.archivedAt ?? null);
}

async function clean() {
	await db.activity.deleteMany({ where: { company: { domain } } });
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeEach(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Revive Rep", email: mailbox },
	});
});

afterEach(clean);

describe("an archived company that gets a live contact", () => {
	it("comes back when the sync files a new person on it", async () => {
		const company = await archivedCompany("Old Domain");

		const result = await match.resolve(
			{
				participants: [{ email: `neu@${domain}`, name: "Neue Person" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			context,
		);

		expect(result.companyId).toBe(company.id);
		expect(result.contactId).not.toBeNull();
		expect(await archivedAtOf(company.id)).toBeNull();
	});

	it("stays archived while every contact on it is archived", async () => {
		const company = await archivedCompany("Old Domain");
		await db.contact.create({
			data: {
				firstName: "Alt",
				lastName: "Kontakt",
				email: `alt@${domain}`,
				companyId: company.id,
				source: RecordSource.EMAIL,
				archivedAt: new Date("2026-09-01T00:00:00Z"),
			},
		});

		await match.resolve(
			{
				participants: [{ email: `alt@${domain}`, name: "Alt Kontakt" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			context,
		);

		expect(await archivedAtOf(company.id)).not.toBeNull();
	});

	it("stays archived when another live company already holds the domain", async () => {
		const company = await archivedCompany("Old Domain");
		const live = await db.company.create({
			data: { name: "Live Domain", domain, source: RecordSource.EMAIL },
			select: { id: true },
		});

		const result = await match.resolve(
			{
				participants: [{ email: `neu@${domain}`, name: "Neue Person" }],
				allowCreate: true,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			context,
		);

		expect(result.companyId).toBe(live.id);
		expect(await archivedAtOf(company.id)).not.toBeNull();
	});

	it("comes back instead of a second company with the same domain", async () => {
		const company = await archivedCompany("Old Domain");

		const companyId = await directory.companyForEmail(`jemand@${domain}`);

		expect(companyId).toBe(company.id);
		expect(await archivedAtOf(company.id)).toBeNull();
		expect(await db.company.count({ where: { domain } })).toBe(1);
	});
});

describe("two contacts that share one address", () => {
	it("files the mail on the live one, not on the archived one", async () => {
		const email = `doppelt@${domain}`;
		const company = await db.company.create({
			data: { name: "Doppel", domain, source: RecordSource.EMAIL },
			select: { id: true },
		});

		const archived = await db.contact.create({
			data: {
				firstName: "Alt",
				email,
				companyId: company.id,
				source: RecordSource.EMAIL,
				archivedAt: new Date("2026-09-01T00:00:00Z"),
			},
			select: { id: true },
		});

		const live = await db.contact.create({
			data: {
				firstName: "Neu",
				email,
				companyId: company.id,
				source: RecordSource.EMAIL,
			},
			select: { id: true },
		});

		const result = await match.resolve(
			{
				participants: [{ email, name: "Neu" }],
				allowCreate: false,
				source: RecordSource.EMAIL,
				ownerId: userId,
			},
			context,
		);

		expect(result.contactId).toBe(live.id);
		expect(result.contactId).not.toBe(archived.id);
	});
});
