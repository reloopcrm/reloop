import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { budgetTasksWhere, usageWindowOf } from "@crm/db/plan-usage";
import { DRAFT_KIND, PLANS } from "@crm/db/plans";
import type { ReactivationGroup } from "@crm/db/reactivation";
import { readPlan, writePlan } from "@crm/db/settings";
import type { ConfigService } from "@nestjs/config";
import type { Cache } from "cache-manager";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { EnvironmentVariables } from "../src/config/env.validation";
import { ContactsService } from "../src/contacts/contacts.service";
import { PERSON_VIEW } from "../src/reactivation/reactivation.config";
import {
	type DraftCheck,
	draftsCanRun,
	needsDraft,
	prefetchRoom,
	WinBackDraftPrefetchService,
} from "../src/reactivation/win-back-draft-prefetch.service";
import { WinBackStoryPrefetchService } from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "draft-prefetch-spec";
const prefix = `draft-prefetch-${suffix}`;
const REASON = `Prefetched ${suffix}`;
const DRAFTS = PERSON_VIEW.prefetch.drafts;

const NOW = new Date("2026-10-06T12:00:00.000Z");
const MAIL = new Date("2026-09-20T09:00:00.000Z");
const HOUR_MS = 3_600_000;

function config(key: string | undefined) {
	return {
		get: () => key,
	} as unknown as ConfigService<EnvironmentVariables, true>;
}

function check(overrides: Partial<DraftCheck> = {}): DraftCheck {
	return {
		hasDraft: false,
		hasAddress: true,
		newestAt: MAIL,
		open: false,
		lastFinishedAt: null,
		...overrides,
	};
}

describe("needsDraft", () => {
	it("asks for a draft when none exists", () => {
		expect(needsDraft(check(), NOW)).toBe(true);
	});

	it("skips a person who already has a draft, fresh or stale", () => {
		expect(needsDraft(check({ hasDraft: true }), NOW)).toBe(false);
	});

	it("skips a person whose draft is already queued", () => {
		expect(needsDraft(check({ open: true }), NOW)).toBe(false);
	});

	it("skips a person without an address", () => {
		expect(needsDraft(check({ hasAddress: false }), NOW)).toBe(false);
	});

	it("skips a person without mail", () => {
		expect(needsDraft(check({ newestAt: null }), NOW)).toBe(false);
	});

	it("does not ask again within the retry pause after a try wrote nothing", () => {
		expect(
			needsDraft(
				check({ lastFinishedAt: new Date(NOW.getTime() - HOUR_MS) }),
				NOW,
			),
		).toBe(false);
		expect(
			needsDraft(
				check({
					lastFinishedAt: new Date(
						NOW.getTime() - PERSON_VIEW.retryAfterMs - HOUR_MS,
					),
				}),
				NOW,
			),
		).toBe(true);
	});
});

describe("prefetchRoom", () => {
	it("stops at its own monthly cap without a plan", () => {
		expect(prefetchRoom(null, 0, 0)).toBe(DRAFTS.perMonth);
		expect(prefetchRoom(null, 0, DRAFTS.perMonth)).toBe(0);
	});

	it("keeps the reserve of the plan for drafts a rep asks for", () => {
		const budget = 20;
		const ceiling = budget - Math.ceil(budget * DRAFTS.reserveShare);

		expect(prefetchRoom(budget, ceiling - 1, 0)).toBe(1);
		expect(prefetchRoom(budget, ceiling, 0)).toBe(0);
		expect(ceiling).toBeLessThan(budget);
	});
});

describe("draftsCanRun", () => {
	const setting = {
		openrouterKey: null,
		openaiKey: null,
		anthropicKey: null,
	} as const;
	const none = {
		fixedAi: false,
		envKey: false,
		hosted: false,
		chatgptWorked: false,
	};

	it("is off without any key", () => {
		expect(draftsCanRun(setting, none)).toBe(false);
	});

	it("is on with a stored key, the env key or the included AI", () => {
		expect(draftsCanRun({ ...setting, anthropicKey: "sealed" }, none)).toBe(
			true,
		);
		expect(draftsCanRun(setting, { ...none, envKey: true })).toBe(true);
		expect(
			draftsCanRun(setting, { ...none, fixedAi: true, hosted: true }),
		).toBe(true);
	});

	it("trusts a ChatGPT login only once the agent has used it", () => {
		expect(draftsCanRun(setting, none)).toBe(false);
		expect(draftsCanRun(setting, { ...none, chatgptWorked: true })).toBe(true);
	});

	it("ignores the operator's env key for a hosted customer", () => {
		expect(draftsCanRun(setting, { ...none, envKey: true, hosted: true })).toBe(
			false,
		);
	});
});

const trigger = new AgentTriggerService(db);
const service = new WinBackDraftPrefetchService(
	db,
	trigger,
	config("sk-or-test"),
);

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

async function draftTasks(ids: string[]) {
	return db.agentTask.findMany({
		where: { kind: DRAFT_KIND, contactId: { in: ids } },
		select: { contactId: true, priority: true },
	});
}

async function fill(count: number, priority: number): Promise<void> {
	if (count <= 0) return;
	await db.agentTask.createMany({
		data: Array.from({ length: count }, () => ({
			kind: DRAFT_KIND,
			reason: `spent ${suffix}`,
			priority,
			budget: 1,
			dueAt: new Date(),
			startedAt: new Date(),
			finishedAt: new Date(),
		})),
	});
}

async function used(): Promise<number> {
	const { since } = await usageWindowOf(db);
	return db.agentTask.count({ where: budgetTasksWhere(DRAFT_KIND, since) });
}

async function prefetchedUsed(): Promise<number> {
	const { since } = await usageWindowOf(db);
	return db.agentTask.count({
		where: {
			...budgetTasksWhere(DRAFT_KIND, since),
			priority: PRIORITY.draftPrefetch,
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
	await db.emailDraft.deleteMany({ where: { contactId: { in: ids } } });
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
	planBefore = await readPlan(db);
	await clean();
});

afterEach(async () => {
	await clean();
	await writePlan(db, planBefore);
});

describe("WinBackDraftPrefetchService.queue", () => {
	it("queues drafts only for people without one, behind every draft a rep asked for", async () => {
		await writePlan(db, null);
		const missing = await person("Anna");
		const drafted = await person("Bert");
		const pending = await person("Clara");
		await db.emailDraft.create({
			data: {
				contactId: drafted,
				subject: "Hallo",
				body: "Wie geht es?",
				basedOnUntil: MAIL,
			},
		});
		await db.agentTask.create({
			data: {
				contactId: pending,
				kind: DRAFT_KIND,
				reason: "A rep asked for an email they can send to this contact",
				priority: PRIORITY.emailDraft,
				dueAt: new Date(),
			},
		});

		const queued = await service.queue([missing, drafted, pending], REASON);

		expect(queued).toBe(1);
		const tasks = await draftTasks([missing, drafted, pending]);
		expect(tasks.filter((task) => task.contactId === drafted)).toHaveLength(0);
		expect(tasks.filter((task) => task.contactId === pending)).toHaveLength(1);
		const prefetched = tasks.find((task) => task.contactId === missing);
		expect(prefetched?.priority).toBe(PRIORITY.draftPrefetch);
		expect(PRIORITY.draftPrefetch).toBeLessThan(PRIORITY.emailDraft);
		expect(PRIORITY.draftPrefetch).toBeLessThan(PRIORITY.storyPrefetch);
		expect(PRIORITY.draftPrefetch).toBeGreaterThan(
			PRIORITY.threadInsightBackfill,
		);

		expect(await service.queue([missing], REASON)).toBe(0);
		expect(await draftTasks([missing])).toHaveLength(1);
	});

	it("rechecks a stored draft and a finished try under the lock", async () => {
		await writePlan(db, null);
		const checkedAt = new Date();
		const drafted = await person("Quirin");
		const tried = await person("Rosa");
		await db.emailDraft.create({
			data: { contactId: drafted, subject: "Hallo", body: "Wie geht es?" },
		});
		await db.agentTask.create({
			data: {
				contactId: tried,
				kind: DRAFT_KIND,
				reason: REASON,
				priority: PRIORITY.draftPrefetch,
				dueAt: checkedAt,
				startedAt: new Date(),
				finishedAt: new Date(),
			},
		});

		expect(
			await trigger.emailDraftsPrefetched(
				[drafted, tried],
				REASON,
				prefetchRoom,
				checkedAt,
			),
		).toBe(0);
		expect(await draftTasks([drafted])).toHaveLength(0);
		expect(await draftTasks([tried])).toHaveLength(1);
	});

	it("queues nothing without an AI key", async () => {
		await writePlan(db, null);
		const keyless = new WinBackDraftPrefetchService(
			db,
			trigger,
			config(undefined),
		);
		const id = await person("Dora");

		expect(await keyless.queue([id], REASON)).toBe(0);
		expect(await draftTasks([id])).toHaveLength(0);
	});

	it("stops at its own monthly cap", async () => {
		await writePlan(db, null);
		await fill(
			DRAFTS.perMonth - 1 - (await prefetchedUsed()),
			PRIORITY.draftPrefetch,
		);
		const ids = [await person("Emil"), await person("Frieda")];

		expect(await service.queue(ids, REASON)).toBe(1);
		expect(await service.queue(ids, REASON)).toBe(0);
		expect(await prefetchedUsed()).toBe(DRAFTS.perMonth);
	});

	it("never takes the drafts the plan keeps for a rep", async () => {
		await writePlan(db, "trial");
		const budget = PLANS.trial.draftsPerMonth;
		const ceiling = budget - Math.ceil(budget * DRAFTS.reserveShare);
		await fill(ceiling - 1 - (await used()), PRIORITY.emailDraft);
		const ids = [await person("Greta"), await person("Hanno")];

		expect(await service.queue(ids, REASON)).toBe(1);
		expect(await service.queue(ids, REASON)).toBe(0);
		expect(await used()).toBe(ceiling);
		expect(await trigger.emailDraftRequested(ids[1] as string)).toBe(true);
	});

	it("gives the last prefetch slot to exactly one of several calls that arrive together", async () => {
		await writePlan(db, "trial");
		const budget = PLANS.trial.draftsPerMonth;
		const ceiling = budget - Math.ceil(budget * DRAFTS.reserveShare);
		await fill(ceiling - 1 - (await used()), PRIORITY.emailDraft);
		const ids = await Promise.all(
			["Ilse", "Jonas", "Karla", "Lutz", "Mira", "Nils"].map(person),
		);

		const results = await Promise.all(
			ids.map((id) => service.queue([id], REASON)),
		);

		expect(results.reduce((sum, count) => sum + count, 0)).toBe(1);
		expect(await draftTasks(ids)).toHaveLength(1);
		expect(await used()).toBe(ceiling);
	});

	it("moves a prefetched draft to the front when a rep looks at it", async () => {
		await writePlan(db, null);
		const id = await person("Otto");
		await service.queue([id], REASON);

		expect(await trigger.emailDraftOpened(id)).toBe(true);
		const [task] = await draftTasks([id]);
		expect(task?.priority).toBe(PRIORITY.emailDraft);
		expect(await trigger.emailDraftOpened(id)).toBe(false);
	});
});

describe("the Win back prefetch hands the same people to the drafts", () => {
	const unusedCache = {
		get: async () => undefined,
		set: async () => {},
	} as unknown as Cache;

	function recorder() {
		const calls: string[][] = [];
		let done: () => void = () => {};
		const called = new Promise<void>((resolve) => {
			done = resolve;
		});
		const drafts = {
			queue: async (ids: readonly string[]) => {
				calls.push([...ids]);
				done();
				return 0;
			},
		} as unknown as WinBackDraftPrefetchService;
		return { calls, called, drafts };
	}

	it("prefetches drafts for the top of the list", async () => {
		const { calls, called, drafts } = recorder();
		const stories = new WinBackStoryPrefetchService(
			db,
			{
				personStoriesPrefetched: async () => 0,
			} as unknown as AgentTriggerService,
			unusedCache,
			drafts,
		);
		const people = Array.from({ length: 12 }, (_, index) => ({
			contact: { id: `p${index}` },
		}));
		const groups = [
			{ key: "one", company: null, people, potential: "high", points: 1 },
		] as unknown as ReactivationGroup[];

		stories.listRead(groups);
		await called;

		expect(calls).toEqual([
			people.slice(0, DRAFTS.top).map((row) => row.contact.id),
		]);
	});

	it("prefetches the draft of the next person", async () => {
		const { calls, called, drafts } = recorder();
		const stories = new WinBackStoryPrefetchService(
			db,
			{
				personStoriesPrefetched: async () => 0,
			} as unknown as AgentTriggerService,
			unusedCache,
			drafts,
		);

		stories.nextShown("next-person");
		await called;

		expect(calls).toEqual([["next-person"]]);
	});
});

describe("contacts.draft", () => {
	type Deps = ConstructorParameters<typeof ContactsService>;
	const unused = {} as never;
	const contacts = new ContactsService(
		db,
		unused,
		trigger as Deps[2],
		unused,
		unused,
		unused,
		unused,
	);

	it("moves a prefetched draft to the front when a rep reads its state", async () => {
		await writePlan(db, null);
		const id = await person("Paula");
		await service.queue([id], REASON);

		const state = await contacts.draft(id);

		expect(state.queued).toBe(true);
		const [task] = await draftTasks([id]);
		expect(task?.priority).toBe(PRIORITY.emailDraft);
	});
});
