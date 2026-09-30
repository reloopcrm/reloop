import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection, FactStatus, RecordSource } from "@crm/db";
import { TYPESAFE } from "@crm/db/typesafe";
import { normalisePhone, runContactClean } from "../agent/lib/contact-clean";
import type { Evidence } from "../agent/lib/evidence";
import { recordFact } from "../agent/lib/facts";
import type { JevNoulAsk } from "../agent/lib/jev";

const suffix = process.env.TEST_RUN_ID ?? "contact-names-spec";
const domain = `beispiel-${suffix}.example.test`;
const address = (local: string) => `${local}@${domain}`;

const signed: Evidence[] = [
	{ kind: "crm.thread-reply", detail: "Sent from their address" },
	{ kind: "crm.signature-block", detail: "Viele Gruesse\nMaria Beispiel" },
];

const saved = process.env[TYPESAFE.envVar];

async function seed(input: {
	local: string;
	firstName: string;
	lastName: string | null;
	source?: RecordSource;
	phone?: string;
}): Promise<string> {
	const contact = await db.contact.create({
		data: {
			email: address(input.local),
			firstName: input.firstName,
			lastName: input.lastName,
			phone: input.phone ?? null,
			source: input.source ?? RecordSource.EMAIL,
		},
		select: { id: true },
	});
	return contact.id;
}

async function agentWrote(contactId: string, field: string, value: string) {
	await db.contactFact.create({
		data: {
			contactId,
			field,
			value,
			score: 0.97,
			band: "VERIFIED",
			evidence: signed,
			method: "contact-clean",
			status: FactStatus.APPLIED,
		},
	});
}

async function record(contactId: string) {
	return db.contact.findUniqueOrThrow({
		where: { id: contactId },
		select: { firstName: true, lastName: true, phone: true },
	});
}

async function cleanup(): Promise<void> {
	const contacts = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = contacts.map((contact) => contact.id);

	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contactFact.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(cleanup);

afterAll(async () => {
	await cleanup();
	if (saved === undefined) delete process.env[TYPESAFE.envVar];
	else process.env[TYPESAFE.envVar] = saved;
});

afterEach(cleanup);

describe("a name is only ever replaced by a fuller one", () => {
	it("upgrades an initial to the full first name", async () => {
		const id = await seed({
			local: "m.beispiel",
			firstName: "M.",
			lastName: "Beispiel",
		});

		const result = await recordFact({
			contactId: id,
			field: "name",
			value: "Maria Beispiel",
			evidence: signed,
			method: "contact-clean",
		});

		expect(result.applied).toBe(true);
		expect(await record(id)).toMatchObject({
			firstName: "Maria",
			lastName: "Beispiel",
		});
	});

	it("refuses a name that says less than the record", async () => {
		const id = await seed({
			local: "m.beispiel",
			firstName: "M.",
			lastName: "Beispiel",
		});

		const result = await recordFact({
			contactId: id,
			field: "name",
			value: "Beispiel",
			evidence: signed,
			method: "contact-clean",
		});

		expect(result.applied).toBe(false);
		expect(result.reason).toContain("fuller name");
		expect(await record(id)).toMatchObject({
			firstName: "M.",
			lastName: "Beispiel",
		});
	});

	it("never replaces a first name with its own prefix", async () => {
		const id = await seed({
			local: "johannes",
			firstName: "Johannes",
			lastName: null,
		});

		const result = await recordFact({
			contactId: id,
			field: "name",
			value: "Jo",
			evidence: signed,
			method: "contact-clean",
		});

		expect(result.applied).toBe(false);
		expect(result.reason).toContain("fuller name");
		expect((await record(id)).firstName).toBe("Johannes");
	});

	it("never touches a name a person typed into the CRM", async () => {
		const id = await seed({
			local: "m.beispiel",
			firstName: "M.",
			lastName: "Beispiel",
			source: RecordSource.MANUAL,
		});

		const result = await recordFact({
			contactId: id,
			field: "name",
			value: "Maria Beispiel",
			evidence: signed,
			method: "contact-clean",
		});

		expect(result.applied).toBe(false);
		expect(result.reason).toContain("A person already filled in");
		expect((await record(id)).firstName).toBe("M.");
	});

	it("never touches a name a person changed after the agent wrote it", async () => {
		const id = await seed({
			local: "m.beispiel",
			firstName: "M.",
			lastName: "Beispiel",
		});
		await agentWrote(id, "name", "Marta Beispiel");

		const result = await recordFact({
			contactId: id,
			field: "name",
			value: "Maria Beispiel",
			evidence: signed,
			method: "contact-clean",
		});

		expect(result.applied).toBe(false);
		expect((await record(id)).firstName).toBe("M.");
	});
});

describe("a phone number from the newest signature", () => {
	it("replaces a number the agent wrote", async () => {
		const id = await seed({
			local: "m.beispiel",
			firstName: "Maria",
			lastName: "Beispiel",
			phone: "+49301234567",
		});
		await agentWrote(id, "phone", "+49301234567");

		const result = await recordFact({
			contactId: id,
			field: "phone",
			value: "+49307654321",
			evidence: signed,
			method: "contact-clean",
		});

		expect(result.applied).toBe(true);
		expect((await record(id)).phone).toBe("+49307654321");
	});

	it("never replaces a number a person changed after the agent wrote it", async () => {
		const id = await seed({
			local: "m.beispiel",
			firstName: "Maria",
			lastName: "Beispiel",
			phone: "030 999999",
		});
		await agentWrote(id, "phone", "+49301234567");

		const result = await recordFact({
			contactId: id,
			field: "phone",
			value: "+49307654321",
			evidence: signed,
			method: "contact-clean",
		});

		expect(result.applied).toBe(false);
		expect((await record(id)).phone).toBe("030 999999");
	});
});

describe("normalisePhone", () => {
	it("writes every spelling of a number in one form", () => {
		expect(normalisePhone("+49 (0)30 1234567")).toBe("+49301234567");
		expect(normalisePhone("0049 30 / 123 45 67")).toBe("+49301234567");
		expect(normalisePhone("030-1234567")).toBe("0301234567");
	});

	it("keeps the main number and drops an extension", () => {
		expect(normalisePhone("+1 555 123 4567 ext. 89")).toBe("+15551234567");
		expect(normalisePhone("+1 555 123 4567 x89")).toBe("+15551234567");
		expect(normalisePhone("+49 30 123456 Durchwahl 12")).toBe("+4930123456");
		expect(normalisePhone("+49 30 123456-DW 12")).toBe("+4930123456");
	});

	it("keeps the leading zero of an Italian number", () => {
		expect(normalisePhone("+39 (0)6 1234 5678")).toBe("+390612345678");
		expect(normalisePhone("0039 06 1234 5678")).toBe("+390612345678");
	});

	it("refuses more digits than a phone number can have", () => {
		expect(normalisePhone("+49 30 1234 5678 9012 345")).toBeNull();
	});

	it("drops a fragment that is no phone number", () => {
		expect(normalisePhone("Tel. 12")).toBeNull();
		expect(normalisePhone("")).toBeNull();
	});
});

describe("contact-clean reads the sender line", () => {
	it("upgrades the name from the display name without asking the signature gate", async () => {
		process.env[TYPESAFE.envVar] = "ts-gate-key";

		const id = await seed({
			local: "m.beispiel",
			firstName: "M.",
			lastName: "Beispiel",
		});
		const thread = await db.emailThread.create({
			data: {
				rootMessageId: `root-${suffix}`,
				subject: "Anfrage",
				contactId: id,
				firstMessageAt: new Date(),
				lastMessageAt: new Date(),
				messageCount: 1,
			},
			select: { id: true },
		});
		await db.emailMessage.create({
			data: {
				threadId: thread.id,
				rfcMessageId: `msg-${suffix}`,
				direction: EmailDirection.INBOUND,
				fromEmail: address("m.beispiel"),
				fromName: "Maria Beispiel",
				recipients: [],
				subject: "Anfrage",
				body: "Bitte ein Angebot. Danke.",
				sentAt: new Date(),
			},
		});

		const asked: unknown[] = [];
		const ask: JevNoulAsk = async (_key, state) => {
			asked.push(state);
			return 0.01;
		};

		await runContactClean(id, {
			ask,
			read: async () => ({
				fullName: "Maria Beispiel",
				title: "Einkauf",
				phone: null,
				mobile: "0171 1234567",
				companyName: null,
				signatureQuote: null,
				foundInSignature: true,
			}),
		});

		expect(asked).toHaveLength(0);
		expect(await record(id)).toMatchObject({
			firstName: "Maria",
			lastName: "Beispiel",
			phone: "01711234567",
		});
	});
});
