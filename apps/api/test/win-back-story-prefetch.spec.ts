import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { usageWindowOf } from "@crm/db/plan-usage";
import { forwardReserve, INSIGHT_KIND, PLANS, STORY_KIND } from "@crm/db/plans";
import type { ReactivationGroup } from "@crm/db/reactivation";
import { readPlan, writePlan } from "@crm/db/settings";
import type { Cache } from "cache-manager";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { PERSON_VIEW } from "../src/reactivation/reactivation.config";
import {
	needsStory,
	readsDefaultList,
	type StoryCheck,
	topOfList,
	WinBackStoryPrefetchService,
} from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "story-prefetch-spec";
const prefix = `prefetch-${suffix}`;
const REASON = `Prefetched ${suffix}`;

const NOW = new Date("2026-10-06T12:00:00.000Z");
const MAIL = new Date("2026-09-20T09:00:00.000Z");
const HOUR_MS = 3_600_000;

const STORY = {
	v: 1,
	gist: "Anna wartet auf ein Angebot.",
	together: null,
	stopped: null,
	bringBack: null,
	passages: [],
};

function group(
	key: string,
	potential: ReactivationGroup["potential"],
	points: number,
	people: string[],
): ReactivationGroup {
	return {
		key,
		company: null,
		people: people.map((id) => ({ contact: { id } })),
		potential,
		points,
	} as unknown as ReactivationGroup;
}

function check(overrides: Partial<StoryCheck> = {}): StoryCheck {
	return {
		story: { story: STORY, language: "conversation", basedOnUntil: MAIL },
		newestAt: MAIL,
		open: false,
		lastFinishedAt: null,
		...overrides,
	};
}

describe("topOfList", () => {
	it("takes the first people of the list in its default order", () => {
		const groups = [
			group("low", "low", 90, ["l1"]),
			group("high-b", "high", 10, ["hb1", "hb2"]),
			group("medium", "medium", 50, ["m1"]),
			group("high-a", "high", 40, ["ha1"]),
		];

		expect(topOfList(groups, 4)).toEqual(["ha1", "hb1", "hb2", "m1"]);
	});

	it("stops at the configured number of people", () => {
		const people = Array.from({ length: 30 }, (_, index) => `p${index}`);

		expect(topOfList([group("one", "high", 1, people)])).toHaveLength(
			PERSON_VIEW.prefetch.top,
		);
	});
});

describe("needsStory", () => {
	it("asks for a story when none exists", () => {
		expect(needsStory(check({ story: null }), "conversation", NOW)).toBe(true);
	});

	it("skips a fresh story", () => {
		expect(needsStory(check(), "conversation", NOW)).toBe(false);
	});

	it("skips a person whose story is already queued", () => {
		expect(
			needsStory(check({ story: null, open: true }), "conversation", NOW),
		).toBe(false);
	});

	it("skips a person without mail", () => {
		expect(
			needsStory(check({ story: null, newestAt: null }), "conversation", NOW),
		).toBe(false);
	});

	it("asks again for a story in another language", () => {
		expect(needsStory(check(), "de", NOW)).toBe(true);
	});

	it("asks again for a story older than the newest mail", () => {
		expect(
			needsStory(
				check({ newestAt: new Date(MAIL.getTime() + HOUR_MS) }),
				"conversation",
				NOW,
			),
		).toBe(true);
	});

	it("asks again for a story that does not parse", () => {
		expect(
			needsStory(
				check({
					story: {
						story: { v: 9 },
						language: "conversation",
						basedOnUntil: MAIL,
					},
				}),
				"conversation",
				NOW,
			),
		).toBe(true);
	});

	it("does not ask again within the retry pause after a try found nothing", () => {
		const recent = new Date(NOW.getTime() - HOUR_MS);

		expect(
			needsStory(
				check({ story: null, lastFinishedAt: recent }),
				"conversation",
				NOW,
			),
		).toBe(false);
		expect(
			needsStory(
				check({
					story: null,
					lastFinishedAt: new Date(
						NOW.getTime() - PERSON_VIEW.retryAfterMs - HOUR_MS,
					),
				}),
				"conversation",
				NOW,
			),
		).toBe(true);
	});

	it("asks again when new mail arrived after the last try", () => {
		expect(
			needsStory(
				check({
					story: null,
					newestAt: NOW,
					lastFinishedAt: new Date(NOW.getTime() - HOUR_MS),
				}),
				"conversation",
				NOW,
			),
		).toBe(true);
	});
});

describe("readsDefaultList", () => {
	it("reuses only the list everyone sees by default", () => {
		const base = {
			rejected: false,
			scope: "everyone",
			quietForDays: 0,
		} as const;

		expect(readsDefaultList(base)).toBe(true);
		expect(readsDefaultList({ ...base, scope: "me" })).toBe(false);
		expect(readsDefaultList({ ...base, rejected: true })).toBe(false);
		expect(readsDefaultList({ ...base, quietForDays: 30 })).toBe(false);
	});
});

const trigger = new AgentTriggerService(db);
const memory = new Map<string, unknown>();
const cache = {
	get: async (key: string) => memory.get(key),
	set: async (key: string, value: unknown) => {
		memory.set(key, value);
	},
} as unknown as Cache;
const service = new WinBackStoryPrefetchService(db, trigger, cache);

let planBefore: string | null = null;

async function person(name: string): Promise<string> {
	const contact = await db.contact.create({
		data: {
			firstName: name,
			email: `${prefix}-${name.toLowerCase()}@example.com`,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	await db.emailThread.create({
		data: {
			rootMessageId: `root-${crypto.randomUUID()}@example.com`,
			subject: "Angebot",
			contactId: contact.id,
			firstMessageAt: MAIL,
			lastMessageAt: MAIL,
			messageCount: 1,
		},
	});
	return contact.id;
}

async function storyTasks(ids: string[]) {
	return db.agentTask.findMany({
		where: { kind: STORY_KIND, contactId: { in: ids } },
		select: { contactId: true, priority: true, finishedAt: true },
	});
}

async function fill(count: number): Promise<void> {
	if (count <= 0) return;
	await db.agentTask.createMany({
		data: Array.from({ length: count }, () => ({
			kind: INSIGHT_KIND,
			reason: `spent ${suffix}`,
			priority: 0,
			budget: 1,
			dueAt: new Date(),
			finishedAt: new Date(),
		})),
	});
}

async function used(): Promise<number> {
	const { since } = await usageWindowOf(db);
	return db.agentTask.count({
		where: {
			kind: { in: [INSIGHT_KIND, STORY_KIND] },
			createdAt: { gte: since },
		},
	});
}

async function clean(): Promise<void> {
	const contacts = await db.contact.findMany({
		where: { email: { startsWith: prefix } },
		select: { id: true },
	});
	const ids = contacts.map((row) => row.id);
	await db.agentTask.deleteMany({
		where: {
			OR: [{ contactId: { in: ids } }, { reason: { contains: suffix } }],
		},
	});
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
	memory.clear();
	planBefore = await readPlan(db);
	await clean();
});

afterEach(async () => {
	await clean();
	await writePlan(db, planBefore);
});

describe("WinBackStoryPrefetchService.queue", () => {
	it("queues only the people whose story is missing, behind every opened story", async () => {
		await writePlan(db, null);
		const missing = await person("Anna");
		const fresh = await person("Bert");
		const pending = await person("Clara");
		await db.contactStory.create({
			data: {
				contactId: fresh,
				story: STORY,
				language: "conversation",
				basedOnUntil: MAIL,
			},
		});
		await db.agentTask.create({
			data: {
				contactId: pending,
				kind: STORY_KIND,
				reason: "A rep opened this person in Win back",
				priority: PRIORITY.personStory,
				dueAt: new Date(),
			},
		});

		const queued = await service.queue([missing, fresh, pending], REASON);

		expect(queued).toBe(1);
		const tasks = await storyTasks([missing, fresh, pending]);
		expect(tasks.filter((task) => task.contactId === pending)).toHaveLength(1);
		expect(tasks.filter((task) => task.contactId === fresh)).toHaveLength(0);
		const prefetched = tasks.find((task) => task.contactId === missing);
		expect(prefetched?.priority).toBe(PRIORITY.storyPrefetch);
		expect(PRIORITY.storyPrefetch).toBeLessThan(PRIORITY.personStory);
		expect(PRIORITY.storyPrefetch).toBeGreaterThan(
			PRIORITY.threadInsightBackfill,
		);

		expect(await service.queue([missing], REASON)).toBe(0);
		expect(await storyTasks([missing])).toHaveLength(1);
	});

	it("stops before the share kept for stories a rep opens", async () => {
		await writePlan(db, "trial");
		const limits = PLANS.trial;
		const budget = limits.insightsPerMonth;
		const ceiling =
			budget -
			forwardReserve(STORY_KIND, limits) -
			Math.ceil(budget * PERSON_VIEW.prefetch.openShare);
		await fill(ceiling - 1 - (await used()));
		const ids = [await person("Dora"), await person("Emil")];

		expect(await service.queue(ids, REASON)).toBe(1);
		expect(await service.queue(ids, REASON)).toBe(0);
		expect(await used()).toBeLessThan(
			budget - forwardReserve(STORY_KIND, limits),
		);

		expect(await trigger.personStoryRequested(ids[1] as string, false)).toBe(
			true,
		);
	});

	it("moves a prefetched story to the front when the rep opens the person", async () => {
		await writePlan(db, null);
		const id = await person("Fritz");
		await service.queue([id], REASON);

		expect(await trigger.personStoryOpened(id)).toBe(true);
		const [task] = await storyTasks([id]);
		expect(task?.priority).toBe(PRIORITY.personStory);
		expect(await trigger.personStoryOpened(id)).toBe(false);
	});
});
