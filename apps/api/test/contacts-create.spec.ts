import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { API_KEY_HEADER, auth } from "@crm/auth";
import { db } from "@crm/db";
import {
	BadRequestException,
	ConflictException,
	HttpException,
} from "@nestjs/common";
import request from "supertest";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { DispatchHeartbeatService } from "../src/agent/dispatch-heartbeat.service";
import { BackfillService } from "../src/backfill/backfill.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { CONTACT_INPUT } from "../src/contacts/contacts.config";
import { contactCreateInput } from "../src/contacts/contacts.contracts";
import { ContactsService } from "../src/contacts/contacts.service";
import { createApp } from "../src/create-app";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import { FieldsService } from "../src/fields/fields.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const runId = process.env.TEST_RUN_ID ?? "contacts-create-spec";
const domain = `create-${runId}.test`;
const userId = `contacts-create-${runId}`;
const userEmail = `${userId}@example.com`;
const taken = `taken@${domain}`;
const blocked = `blocked@${domain}`;
const ours = { email: { endsWith: `@${domain}` } };

const stamp = new ActivityStampService(db);
const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
} as unknown as AgentTriggerService;
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const queue = new AgentQueueService(db);
const fields = new FieldsService(db, agent);
const match = new MailboxMatchService(db, directory, agent, log);
const participants = new ThreadParticipantsService(db, match, stamp, agent);
const contacts = new ContactsService(
	db,
	directory,
	agent,
	queue,
	stamp,
	fields,
	participants,
);

let companyId = "";
let archivedCompanyId = "";

async function rejection(run: () => Promise<unknown>): Promise<Error | null> {
	try {
		await run();
	} catch (error) {
		if (error instanceof Error) return error;
		throw error;
	}
	return null;
}

async function statusOf(run: () => Promise<unknown>): Promise<number> {
	try {
		await run();
	} catch (error) {
		if (error instanceof HttpException) return error.getStatus();
		throw error;
	}
	return 0;
}

async function clean() {
	await db.contact.deleteMany({ where: ours });
	await db.suppressedContact.deleteMany({ where: ours });
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Create Rep", email: userEmail },
	});
	companyId = (
		await db.company.create({
			data: { name: `Live ${runId}`, domain: `live.${domain}` },
			select: { id: true },
		})
	).id;
	archivedCompanyId = (
		await db.company.create({
			data: {
				name: `Archived ${runId}`,
				domain: `archived.${domain}`,
				archivedAt: new Date(),
			},
			select: { id: true },
		})
	).id;
	await db.contact.create({
		data: { firstName: "Taken", email: taken },
	});
	await db.suppressedContact.create({ data: { email: blocked } });
});

afterAll(clean);

describe("creating a contact through the service", () => {
	it("answers 409 with a plain sentence for an address in use, in any case", async () => {
		const error = await rejection(() =>
			contacts.create({ firstName: "Twin", email: taken.toUpperCase() }),
		);

		expect(error).toBeInstanceOf(ConflictException);
		expect((error as ConflictException).message).toBe(
			"Another contact already uses that email address.",
		);
	});

	it("answers 409 when a parallel create wins the address", async () => {
		const address = `race@${domain}`;
		const results = await Promise.allSettled([
			contacts.create({ firstName: "One", email: address }),
			contacts.create({ firstName: "Two", email: address }),
		]);
		const failed = results.filter((result) => result.status === "rejected");

		expect(failed).toHaveLength(1);
		expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(
			ConflictException,
		);
		expect(await db.contact.count({ where: { email: address } })).toBe(1);
	});

	it("refuses an unknown company with 400 and creates nothing", async () => {
		const address = `nocompany@${domain}`;

		expect(
			await statusOf(() =>
				contacts.create({
					firstName: "Lost",
					email: address,
					companyId: "no-such-company",
				}),
			),
		).toBe(400);
		expect(await db.contact.count({ where: { email: address } })).toBe(0);
	});

	it("refuses an archived company with 400", async () => {
		expect(
			await statusOf(() =>
				contacts.create({
					firstName: "Archived",
					email: `archived@${domain}`,
					companyId: archivedCompanyId,
				}),
			),
		).toBe(400);
	});

	it("refuses an unknown owner with 400 and creates nothing", async () => {
		const address = `noowner@${domain}`;
		const error = await rejection(() =>
			contacts.create({
				firstName: "Owned",
				email: address,
				ownerId: "no-such-user",
			}),
		);

		expect(error).toBeInstanceOf(BadRequestException);
		expect(await db.contact.count({ where: { email: address } })).toBe(0);
	});

	it("keeps a valid company and owner", async () => {
		const created = await contacts.create({
			firstName: "Fine",
			email: `fine@${domain}`,
			companyId,
			ownerId: userId,
		});

		expect(
			(
				await db.contact.findUnique({
					where: { id: created.id },
					select: { companyId: true, ownerId: true },
				})
			)?.ownerId,
		).toBe(userId);
	});

	it("answers 409 on a suppressed address and keeps the suppression", async () => {
		expect(
			await statusOf(() =>
				contacts.create({ firstName: "Gone", email: blocked.toUpperCase() }),
			),
		).toBe(409);
		expect(await db.contact.count({ where: { email: blocked } })).toBe(0);
		expect(
			await db.suppressedContact.findUnique({ where: { email: blocked } }),
		).not.toBeNull();
	});
});

describe("the create input has length limits", () => {
	const fieldsToCheck = [
		["firstName", CONTACT_INPUT.maxNameChars],
		["lastName", CONTACT_INPUT.maxNameChars],
		["phone", CONTACT_INPUT.maxPhoneChars],
		["title", CONTACT_INPUT.maxTitleChars],
	] as const;

	for (const [field, max] of fieldsToCheck) {
		it(`caps ${field} at ${max} characters`, () => {
			const base = { firstName: "Ada" };
			expect(
				contactCreateInput.safeParse({ ...base, [field]: "x".repeat(max) })
					.success,
			).toBe(true);
			expect(
				contactCreateInput.safeParse({ ...base, [field]: "x".repeat(max + 1) })
					.success,
			).toBe(false);
		});
	}

	it("caps the email address", () => {
		const tooLong = `${"a".repeat(CONTACT_INPUT.maxEmailChars)}@example.com`;

		expect(
			contactCreateInput.safeParse({ firstName: "Ada", email: tooLong })
				.success,
		).toBe(false);
	});

	it("caps the ids", () => {
		const tooLong = "x".repeat(CONTACT_INPUT.maxIdChars + 1);

		expect(
			contactCreateInput.safeParse({ firstName: "Ada", companyId: tooLong })
				.success,
		).toBe(false);
		expect(
			contactCreateInput.safeParse({ firstName: "Ada", ownerId: tooLong })
				.success,
		).toBe(false);
	});
});

describe("POST /api/rest/contacts with an API key", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;
	let server: ReturnType<NonNullable<typeof app>["getHttpServer"]>;
	let key = "";
	let allowed: string | undefined;
	const spies: { mockRestore: () => void }[] = [];

	beforeAll(async () => {
		allowed = process.env.ALLOWED_SIGN_IN;
		process.env.ALLOWED_SIGN_IN = "example.com";
		spies.push(
			spyOn(
				DispatchHeartbeatService.prototype,
				"onApplicationBootstrap",
			).mockImplementation(() => {}),
			spyOn(
				MailboxSyncHeartbeatService.prototype,
				"onApplicationBootstrap",
			).mockImplementation(() => {}),
			spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
				() => {},
			),
			spyOn(db, "$disconnect").mockResolvedValue(undefined),
		);
		key = (
			await auth.api.createApiKey({
				body: { name: "contacts create spec", userId, expiresIn: null },
			})
		).key;
		app = await createApp();
		server = app.getHttpServer();
	});

	afterAll(async () => {
		await app?.close();
		for (const spy of spies) spy.mockRestore();
		if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
		else process.env.ALLOWED_SIGN_IN = allowed;
	});

	function post(body: Record<string, string | null>) {
		return request(server)
			.post("/api/rest/contacts")
			.set(API_KEY_HEADER, key)
			.send(body);
	}

	it("answers 409 for an address in use", async () => {
		const response = await post({ firstName: "Twin", email: taken });

		expect(response.status).toBe(409);
		expect(response.body.message).toBe(
			"Another contact already uses that email address.",
		);
	});

	it("answers 409 for a suppressed address and creates nothing", async () => {
		const response = await post({ firstName: "Gone", email: blocked });

		expect(response.status).toBe(409);
		expect(await db.contact.count({ where: { email: blocked } })).toBe(0);
		expect(
			await db.suppressedContact.findUnique({ where: { email: blocked } }),
		).not.toBeNull();
	});

	it("answers 400 for an unknown company", async () => {
		const response = await post({
			firstName: "Lost",
			email: `rest-lost@${domain}`,
			companyId: "no-such-company",
		});

		expect(response.status).toBe(400);
	});

	it("answers 400 for a name over the limit", async () => {
		const response = await post({
			firstName: "x".repeat(CONTACT_INPUT.maxNameChars + 1),
		});

		expect(response.status).toBe(400);
	});

	it("creates a valid contact", async () => {
		const response = await post({
			firstName: "Rest",
			email: `rest-ok@${domain}`,
			companyId,
			ownerId: userId,
		});

		expect(response.status).toBe(200);
		expect(
			(
				await db.contact.findFirst({
					where: { email: `rest-ok@${domain}` },
					select: { companyId: true },
				})
			)?.companyId,
		).toBe(companyId);
	});
});
