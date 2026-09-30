import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { archiveOwnContacts, pruneContacts } from "../agent/lib/contact-prune";

const suffix = process.env.TEST_RUN_ID ?? "contact-prune-spec";
const workDomain = `own-${suffix}.example.test`;
const gmailUser = `boss.${suffix}@gmail.com`;
const workUser = `staff.${suffix}@${workDomain}`;

const emails = {
	gmailContact: `kunde.${suffix}@gmail.com`,
	workEmail: `kollege.${suffix}@${workDomain}`,
	workManual: `kollege2.${suffix}@${workDomain}`,
};

async function clean(): Promise<void> {
	await db.contact.deleteMany({
		where: { email: { in: Object.values(emails) } },
	});
	await db.user.deleteMany({ where: { email: { in: [gmailUser, workUser] } } });
}

async function archived(email: string): Promise<boolean> {
	const contact = await db.contact.findFirst({
		where: { email },
		select: { archivedAt: true },
	});
	return contact?.archivedAt != null;
}

beforeEach(async () => {
	await clean();
	await db.user.createMany({
		data: [
			{ id: `u1-${suffix}`, name: "Boss", email: gmailUser },
			{ id: `u2-${suffix}`, name: "Staff", email: workUser },
		],
	});
	await db.contact.createMany({
		data: [
			{
				firstName: "K",
				lastName: "Kunde",
				email: emails.gmailContact,
				source: RecordSource.EMAIL,
			},
			{
				firstName: "K",
				lastName: "Kollege",
				email: emails.workEmail,
				source: RecordSource.EMAIL,
			},
			{
				firstName: "K",
				lastName: "Manual",
				email: emails.workManual,
				source: RecordSource.MANUAL,
			},
		],
	});
});

afterEach(clean);

describe("archiveOwnContacts", () => {
	it("never treats a freemail domain as the workspace's own", async () => {
		await archiveOwnContacts();

		expect(await archived(emails.gmailContact)).toBe(false);
	});

	it("archives only mail-created contacts on an own work domain", async () => {
		await archiveOwnContacts();

		expect(await archived(emails.workEmail)).toBe(true);
		expect(await archived(emails.workManual)).toBe(false);
	});
});

describe("pruneContacts", () => {
	it("is off and archives nothing", async () => {
		expect(await pruneContacts()).toBe(0);
		expect(await archived(emails.gmailContact)).toBe(false);
		expect(await archived(emails.workEmail)).toBe(false);
	});
});
