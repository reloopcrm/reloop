import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";

const suffix = process.env.TEST_RUN_ID ?? "task-due-spec";
const domain = `task-due-${suffix}.test`;
const userId = `user-${suffix}`;

const service = new ActivitiesService(db, new ActivityStampService(db));
const dashboard = new DashboardService(db, new ConversionService(db));

let companyId: string;
const ids: Record<string, string> = {};

function localMidnight(daysFromToday: number): Date {
	const now = new Date();
	return new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() + daysFromToday,
	);
}

async function clean() {
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function task(key: string, dueAt: Date | null) {
	const row = await db.activity.create({
		data: {
			type: ActivityType.TASK,
			subject: key,
			companyId,
			createdById: userId,
			dueAt,
		},
		select: { id: true },
	});
	ids[key] = row.id;
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Due Rep", email: `rep@${domain}` },
	});
	const company = await db.company.create({
		data: { name: "Due Co", domain },
		select: { id: true },
	});
	companyId = company.id;

	await task("yesterday", localMidnight(-1));
	await task("today", localMidnight(0));
	await task("tomorrow", localMidnight(1));
	await task("undated", null);
});

afterAll(clean);

describe("a due date is a calendar day", () => {
	it("keeps a task due today out of the overdue window all day", async () => {
		const overdue = await service.myTasks(
			{ window: "overdue", limit: 25 },
			userId,
		);
		expect(overdue.map((row) => row.subject)).toEqual(["yesterday"]);
	});

	it("keeps a task due today in the upcoming window", async () => {
		const upcoming = await service.myTasks(
			{ window: "upcoming", limit: 25 },
			userId,
		);
		expect(upcoming.map((row) => row.subject)).toEqual(["today", "tomorrow"]);
	});

	it("lists only tasks whose day has ended on the dashboard", async () => {
		const summary = await dashboard.summary(userId, { scope: "me" });
		expect(summary.overdueTasks.map((row) => row.subject)).toEqual([
			"yesterday",
		]);
	});
});

describe("the upcoming timeline", () => {
	it("orders by due date with undated tasks last", async () => {
		const page = await service.timeline(
			{
				companyId,
				filter: "upcoming",
				limit: 10,
			},
			userId,
		);
		expect(page.entries.map((row) => row.subject)).toEqual([
			"yesterday",
			"today",
			"tomorrow",
			"undated",
		]);
	});

	it("keeps that order and the undated task across pages", async () => {
		const seen: (string | null)[] = [];
		let cursor: string | null = null;
		do {
			const page = await service.timeline(
				{
					companyId,
					filter: "upcoming",
					limit: 1,
					cursor: cursor ?? undefined,
				},
				userId,
			);
			seen.push(...page.entries.map((row) => row.subject));
			cursor = page.nextCursor;
		} while (cursor);
		expect(seen).toEqual(["yesterday", "today", "tomorrow", "undated"]);
	});
});
