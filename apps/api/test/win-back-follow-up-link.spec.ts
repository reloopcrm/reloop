import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { isWinBackTask } from "@crm/validation/activity-meta";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import {
	WIN_BACK_FOLLOW_UP_SUBJECT,
	WinBackFollowUpService,
} from "../src/reactivation/win-back-follow-up.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-follow-up-link-spec";
const domain = `follow-up-link-${suffix}.test`;
const userId = `user-${suffix}`;
const DAY_MS = 86_400_000;

const stamp = new ActivityStampService(db);
const sweep = new WinBackFollowUpService(db, stamp);
const activities = new ActivitiesService(db, stamp);
const dashboard = new DashboardService(db, new ConversionService(db));

let companyId = "";
let contactId = "";

function daysAgo(days: number): Date {
	return new Date(Date.now() - days * DAY_MS);
}

async function clean(): Promise<void> {
	const people = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = people.map((row) => row.id);
	await db.activity.deleteMany({ where: { contactId: { in: ids } } });
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.potentialFeedback.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Link Rep", email: `rep@${domain}` },
	});
	const company = await db.company.create({
		data: { name: "Link Co", domain },
		select: { id: true },
	});
	companyId = company.id;
	const contact = await db.contact.create({
		data: {
			firstName: "Erika",
			lastName: "Still",
			email: `erika@${domain}`,
			ownerId: userId,
			companyId,
		},
		select: { id: true },
	});
	contactId = contact.id;
	await db.potentialFeedback.create({
		data: {
			contactId,
			verdict: "good",
			userId,
			createdAt: daysAgo(30),
			updatedAt: daysAgo(30),
		},
	});
	const sentAt = daysAgo(20);
	await db.emailThread.create({
		data: {
			rootMessageId: `erika-${suffix}@${domain}`,
			subject: "Europaletten",
			contactId,
			companyId,
			firstMessageAt: sentAt,
			lastMessageAt: sentAt,
			messageCount: 1,
			messages: {
				create: {
					rfcMessageId: `erika-0-${suffix}@${domain}`,
					syncedByUserId: userId,
					direction: EmailDirection.OUTBOUND,
					fromEmail: `rep@${domain}`,
					recipients: [],
					subject: "Europaletten",
					sentAt,
				},
			},
		},
	});
	await sweep.sweep();
});

afterAll(clean);

describe("the win back follow-up on the overview", () => {
	it("is written for the person who did not answer", async () => {
		const task = await db.activity.findFirst({
			where: { contactId, subject: WIN_BACK_FOLLOW_UP_SUBJECT },
			select: { id: true },
		});

		expect(task).not.toBeNull();
	});

	it("names the person and marks itself as win back in the overdue list", async () => {
		const summary = await dashboard.summary(userId, { scope: "me" });
		const row = summary.overdueTasks.find(
			(task) => task.subject === WIN_BACK_FOLLOW_UP_SUBJECT,
		);

		expect(row?.contact).toEqual({
			id: contactId,
			firstName: "Erika",
			lastName: "Still",
		});
		expect(isWinBackTask(row?.meta)).toBe(true);
	});

	it("names the person and marks itself as win back in the rep's tasks", async () => {
		const tasks = await activities.myTasks(
			{ window: "overdue", limit: 25 },
			userId,
		);
		const row = tasks.find(
			(task) => task.subject === WIN_BACK_FOLLOW_UP_SUBJECT,
		);

		expect(row?.contact?.id).toBe(contactId);
		expect(isWinBackTask(row?.meta)).toBe(true);
	});
});
