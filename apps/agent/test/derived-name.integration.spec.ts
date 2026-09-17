import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { recordFact } from "../agent/lib/facts";
import { queueContactCleanups } from "../agent/lib/housekeeping";

const suffix = process.env.TEST_RUN_ID ?? "derived-name-spec";
const domain = `acme-${suffix}.test`;
const initialEmail = `a.mueller@${domain}`;
const fullEmail = `anna.schmidt@${domain}`;
const deskEmail = `buero@${domain}`;

const startedAt = new Date();
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

let initialId: string;
let fullId: string;
let deskId: string;

async function seed(input: {
	email: string;
	firstName: string;
	lastName: string;
	cleanedAt: Date | null;
}): Promise<string> {
	const contact = await db.contact.create({
		data: {
			firstName: input.firstName,
			lastName: input.lastName,
			email: input.email,
			cleanedAt: input.cleanedAt,
			lastActivityAt: new Date(),
		},
		select: { id: true },
	});

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `<root.${input.email}>`,
			subject: "Angebot",
			contactId: contact.id,
			firstMessageAt: daysAgo(1),
			lastMessageAt: new Date(),
			messageCount: 1,
		},
		select: { id: true },
	});

	await db.emailMessage.create({
		data: {
			threadId: thread.id,
			rfcMessageId: `<in.${input.email}>`,
			direction: EmailDirection.INBOUND,
			fromEmail: input.email,
			recipients: [],
			subject: "Angebot",
			body: "Mit freundlichen Gruessen\nAnna Mueller",
			sentAt: new Date(),
		},
	});

	return contact.id;
}

beforeAll(async () => {
	await cleanup();

	initialId = await seed({
		email: initialEmail,
		firstName: "A",
		lastName: "Mueller",
		cleanedAt: daysAgo(2),
	});

	fullId = await seed({
		email: fullEmail,
		firstName: "Anna",
		lastName: "Schmidt",
		cleanedAt: daysAgo(2),
	});

	deskId = await seed({
		email: deskEmail,
		firstName: "Klaus",
		lastName: "Berger",
		cleanedAt: daysAgo(2),
	});
});

afterAll(cleanup);

async function cleanup(): Promise<void> {
	const contacts = await db.contact.findMany({
		where: { email: { in: [initialEmail, fullEmail, deskEmail] } },
		select: { id: true },
	});
	const ids = contacts.map((contact) => contact.id);

	await db.agentTask.deleteMany({
		where: { kind: "contact-clean", createdAt: { gte: startedAt } },
	});
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contactFact.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
}

describe("a name the mailbox cut out of the address is not a person's answer", () => {
	it("lets the signature name replace an initial and a surname", async () => {
		const result = await recordFact({
			contactId: initialId,
			field: "name",
			value: "Anna Mueller",
			evidence: [
				{ kind: "crm.thread-reply", detail: `Sent from ${initialEmail}` },
				{ kind: "crm.signature-block", detail: "Mit freundlichen Gruessen" },
			],
			method: "contact-clean",
		});

		expect(result.applied).toBe(true);

		const contact = await db.contact.findUnique({
			where: { id: initialId },
			select: { firstName: true, lastName: true },
		});
		expect(contact?.firstName).toBe("Anna");
		expect(contact?.lastName).toBe("Mueller");
	});

	it("refuses to touch a full name a person could have typed", async () => {
		const result = await recordFact({
			contactId: fullId,
			field: "name",
			value: "Anna Schmitt",
			evidence: [
				{ kind: "crm.thread-reply", detail: `Sent from ${fullEmail}` },
				{ kind: "crm.signature-block", detail: "Mit freundlichen Gruessen" },
			],
			method: "contact-clean",
		});

		expect(result.applied).toBe(false);
		expect(result.reason).toContain("A person already filled in");

		const contact = await db.contact.findUnique({
			where: { id: fullId },
			select: { lastName: true },
		});
		expect(contact?.lastName).toBe("Schmidt");
	});
});

describe("a signature that arrives after the first read", () => {
	it("reads a machine made name again, and settles the rest", async () => {
		await queueContactCleanups();

		const queued = await db.agentTask.findMany({
			where: { kind: "contact-clean", finishedAt: null },
			select: { contactId: true },
		});
		const waiting = new Set(queued.map((task) => task.contactId));

		expect(waiting.has(initialId)).toBe(true);
		expect(waiting.has(deskId)).toBe(false);

		const settled = await db.contact.findUnique({
			where: { id: deskId },
			select: { cleanedAt: true },
		});
		expect(settled?.cleanedAt?.getTime()).toBeGreaterThan(daysAgo(1).getTime());
	});
});
