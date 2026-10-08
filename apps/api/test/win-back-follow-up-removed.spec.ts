import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import {
	WIN_BACK_FOLLOW_UP_SUBJECT,
	WinBackFollowUpService,
} from "../src/reactivation/win-back-follow-up.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-follow-up-removed";
const domain = `removed-${suffix}.test`;
const activeId = `active-${suffix}`;
const removedId = `removed-${suffix}`;

const DAY_MS = 86_400_000;
const now = new Date(Date.UTC(2026, 2, 12, 12));

function daysAgo(days: number): Date {
	return new Date(now.getTime() - days * DAY_MS);
}

const service = new WinBackFollowUpService(db, new ActivityStampService(db));

const contactIds: string[] = [];
let companyId = "";

async function person(
	name: string,
	ownerId: string,
	decidedBy: string,
): Promise<string> {
	const email = `${name}@${domain}`;
	const contact = await db.contact.create({
		data: { firstName: name, email, ownerId, companyId },
		select: { id: true },
	});
	contactIds.push(contact.id);

	await db.potentialFeedback.create({
		data: {
			contactId: contact.id,
			verdict: "good",
			userId: decidedBy,
			createdAt: daysAgo(30),
			updatedAt: daysAgo(30),
		},
	});

	await db.emailThread.create({
		data: {
			rootMessageId: `${name}-${suffix}@${domain}`,
			subject: `Talking to ${name}`,
			contactId: contact.id,
			companyId,
			firstMessageAt: daysAgo(20),
			lastMessageAt: daysAgo(20),
			messageCount: 1,
			messages: {
				create: [
					{
						rfcMessageId: `${name}-0-${suffix}@${domain}`,
						syncedByUserId: decidedBy,
						direction: EmailDirection.OUTBOUND,
						fromEmail: `rep@${domain}`,
						recipients: [],
						subject: `Talking to ${name}`,
						sentAt: daysAgo(20),
					},
				],
			},
		},
	});

	return contact.id;
}

beforeAll(async () => {
	await db.user.createMany({
		data: [
			{
				id: activeId,
				name: "Active rep",
				email: `active@${domain}`,
				emailVerified: true,
			},
			{
				id: removedId,
				name: "Removed rep",
				email: `removed@${domain}`,
				emailVerified: true,
				removedAt: daysAgo(1),
			},
		],
		skipDuplicates: true,
	});

	const company = await db.company.create({
		data: { name: `Removed ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;
});

afterAll(async () => {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `${suffix}@${domain}` } },
	});
	await db.activity.deleteMany({ where: { contactId: { in: contactIds } } });
	await db.potentialFeedback.deleteMany({
		where: { contactId: { in: contactIds } },
	});
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: { in: [activeId, removedId] } } });
});

describe("the follow-up task and removed members", () => {
	it("writes no task for a contact whose owner and decider were removed", async () => {
		const orphan = await person("orphan", removedId, removedId);

		await service.sweep(now);

		expect(
			await db.activity.count({
				where: { contactId: orphan, subject: WIN_BACK_FOLLOW_UP_SUBJECT },
			}),
		).toBe(0);
		const feedback = await db.potentialFeedback.findFirst({
			where: { contactId: orphan },
			select: { followUpTaskAt: true },
		});
		expect(feedback?.followUpTaskAt).toBeNull();
	});

	it("gives the task to the active owner when the decider was removed", async () => {
		const kept = await person("kept", activeId, removedId);

		await service.sweep(now);

		const task = await db.activity.findFirst({
			where: { contactId: kept, subject: WIN_BACK_FOLLOW_UP_SUBJECT },
			select: { createdById: true },
		});
		expect(task?.createdById).toBe(activeId);
	});
});
