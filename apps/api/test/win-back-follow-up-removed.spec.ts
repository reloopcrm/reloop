import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db, EmailDirection } from "@crm/db";
import { listWinBackFollowUps } from "@crm/db/win-back-outcome";
import { workspaceSlug } from "@crm/db/workspace";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import {
	WIN_BACK_FOLLOW_UP_SUBJECT,
	WinBackFollowUpService,
} from "../src/reactivation/win-back-follow-up.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-follow-up-removed";
const domain = `removed-${suffix}.test`;
const activeId = `active-${suffix}`;
const removedId = `removed-${suffix}`;
const firstAdminId = `first-admin-${suffix}`;
const secondAdminId = `second-admin-${suffix}`;
const removedOwnerId = `removed-owner-${suffix}`;
const plainMemberId = `plain-member-${suffix}`;
const userIds = [
	activeId,
	removedId,
	firstAdminId,
	secondAdminId,
	removedOwnerId,
	plainMemberId,
];
const memberIds = [
	`${suffix}-member-a`,
	`${suffix}-member-b`,
	`${suffix}-member-c`,
	`${suffix}-member-d`,
];

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

function longAgo(year: number): Date {
	return new Date(Date.UTC(year, 0, 1));
}

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
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
			{
				id: firstAdminId,
				name: "First admin",
				email: `first-admin@${domain}`,
				emailVerified: true,
			},
			{
				id: secondAdminId,
				name: "Second admin",
				email: `second-admin@${domain}`,
				emailVerified: true,
			},
			{
				id: removedOwnerId,
				name: "Removed owner",
				email: `removed-owner@${domain}`,
				emailVerified: true,
				removedAt: daysAgo(1),
			},
			{
				id: plainMemberId,
				name: "Plain member",
				email: `plain-member@${domain}`,
				emailVerified: true,
			},
		],
		skipDuplicates: true,
	});

	await db.member.createMany({
		data: [
			{
				id: `${suffix}-member-b`,
				organizationId: WORKSPACE_ID,
				userId: secondAdminId,
				role: "owner",
				createdAt: longAgo(1990),
			},
			{
				id: `${suffix}-member-a`,
				organizationId: WORKSPACE_ID,
				userId: firstAdminId,
				role: "admin",
				createdAt: longAgo(1990),
			},
			{
				id: `${suffix}-member-c`,
				organizationId: WORKSPACE_ID,
				userId: removedOwnerId,
				role: "owner",
				createdAt: longAgo(1980),
			},
			{
				id: `${suffix}-member-d`,
				organizationId: WORKSPACE_ID,
				userId: plainMemberId,
				role: "member",
				createdAt: longAgo(1970),
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
	await db.member.deleteMany({ where: { id: { in: memberIds } } });
	await db.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("the follow-up task and removed members", () => {
	it("gives the task to the oldest active owner or admin when owner and decider were removed", async () => {
		const orphan = await person("orphan", removedId, removedId);

		await service.sweep(now);

		const task = await db.activity.findFirst({
			where: { contactId: orphan, subject: WIN_BACK_FOLLOW_UP_SUBJECT },
			select: { createdById: true },
		});
		expect(task?.createdById).toBe(firstAdminId);
		const feedback = await db.potentialFeedback.findFirst({
			where: { contactId: orphan },
			select: { followUpTaskAt: true },
		});
		expect(feedback?.followUpTaskAt).toEqual(now);
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

describe("the follow-up candidate list and removed members", () => {
	it("leaves out contacts nobody active can own when the workspace has no active owner or admin", async () => {
		const orphan = await person("orphan-list", removedId, removedId);
		const kept = await person("kept-list", activeId, removedId);

		const listed = await listWinBackFollowUps(db, {
			now,
			afterDays: 14,
			maxAgeDays: 28,
			limit: 1000,
			hasFallback: false,
		});
		const ids = listed.map((entry) => entry.contactId);

		expect(ids).not.toContain(orphan);
		expect(ids).toContain(kept);
	});

	it("keeps contacts nobody active owns when an owner or admin can take them", async () => {
		const orphan = await person("orphan-fallback", removedId, removedId);

		const listed = await listWinBackFollowUps(db, {
			now,
			afterDays: 14,
			maxAgeDays: 28,
			limit: 1000,
			hasFallback: true,
		});

		expect(listed.map((entry) => entry.contactId)).toContain(orphan);
	});
});
