import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { ownVoice } from "../agent/lib/email-draft";

const suffix = process.env.TEST_RUN_ID ?? "draft-voice-spec";
const domain = `voice-${suffix}.test`;
const tom = `tom@${domain}`;
const colleague = `kollegin@${domain}`;
const ownerId = `voice-owner-${suffix}`;
const at = new Date("2026-08-01T09:00:00.000Z");

async function person(local: string): Promise<string> {
	const row = await db.contact.create({
		data: {
			firstName: local,
			email: `${local}@${domain}`,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	return row.id;
}

async function sent(
	contactId: string,
	fromEmail: string,
	body: string,
	syncedByUserId?: string,
) {
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${crypto.randomUUID()}@${domain}`,
			subject: "Workshop",
			contactId,
			firstMessageAt: at,
			lastMessageAt: at,
		},
		select: { id: true },
	});

	await db.emailMessage.create({
		data: {
			threadId: thread.id,
			rfcMessageId: `msg-${crypto.randomUUID()}@${domain}`,
			direction: "OUTBOUND",
			sentAt: at,
			subject: "Workshop",
			body,
			fromEmail,
			syncedByUserId,
			recipients: [`someone@${domain}`],
		},
	});
}

async function clean(): Promise<void> {
	const people = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = people.map((row) => row.id);
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

beforeEach(clean);
afterEach(clean);

describe("whose mails become the sender's voice", () => {
	it("takes only the sender's own mails, to this contact and to others", async () => {
		const maria = await person("maria");
		const other = await person("probe");
		await sent(maria, tom, "Hallo Maria, hast du Lust auf den Workshop?");
		await sent(other, tom, "Sehr geehrter Herr Probe, anbei das Angebot.");
		await sent(
			other,
			colleague,
			"Hallo Herr Probe, hier schreibt die Kollegin.",
		);

		const { senderName, voice } = await ownVoice({
			id: maria,
			owner: null,
			emailThreads: [
				{
					subject: "Workshop",
					lastMessageAt: at,
					messages: [
						{
							direction: "OUTBOUND",
							fromName: "Tom Muster",
							fromEmail: tom,
							subject: "Workshop",
							sentAt: at,
							body: "Hallo Maria, hast du Lust auf den Workshop?",
							snippet: null,
						},
					],
				},
			],
		});

		expect(senderName).toBe("Tom Muster");
		expect(voice.toContact.map((sample) => sample.body)).toEqual([
			"Hallo Maria, hast du Lust auf den Workshop?",
		]);
		expect(voice.general.map((sample) => sample.body)).toEqual([
			"Sehr geehrter Herr Probe, anbei das Angebot.",
		]);
	});

	it("takes only the owner's own mails when nobody wrote to the contact yet", async () => {
		const maria = await person("maria");
		const other = await person("probe");
		await db.user.create({
			data: { id: ownerId, name: "Tom Muster", email: tom },
		});
		await sent(other, tom, "Hallo Herr Probe, anbei das Angebot.", ownerId);
		await sent(
			other,
			colleague,
			"Hallo Herr Probe, hier schreibt die Kollegin.",
			ownerId,
		);

		const { senderName, voice } = await ownVoice({
			id: maria,
			owner: { id: ownerId, name: "Tom Muster" },
			emailThreads: [],
		});

		expect(senderName).toBe("Tom Muster");
		expect(voice.general.map((sample) => sample.body)).toEqual([
			"Hallo Herr Probe, anbei das Angebot.",
		]);
	});
});
