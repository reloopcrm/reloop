import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type Prisma } from "@crm/db";
import { SETTINGS_ID, writeAgentProvider } from "@crm/db/settings";
import { TYPESAFE } from "@crm/db/typesafe";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import { writeWinBackRules } from "@crm/validation/win-back-rules";
import { runInsightLane } from "../agent/lib/dispatch";
import { forgetProviderCache, markExhausted } from "../agent/lib/model";
import { type FakeCodexHome, fakeCodexHome } from "./codex-home";

const DAY_MS = 86_400_000;
const OPENROUTER_KEYS = ["OPENROUTER_API_KEY"] as const;
const KEY = "ts-gate-lane-key";

const suffix = crypto.randomUUID();
const reason = `insight-gate-lane-${suffix}`;

const savedOpenrouter = new Map<string, string>();
const savedTypesafe = process.env[TYPESAFE.envVar];
let savedSetting: Prisma.AppSettingUncheckedCreateInput | null = null;
let codexHome: FakeCodexHome | null = null;

let gateCalls = 0;
let outsideCalls: string[] = [];
let noul = 0.1;
let gateFails = false;
const realFetch = globalThis.fetch;
const lines: string[] = [];
const realError = console.error;

function stubFetch(): void {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input instanceof Request ? input.url : input);

		if (url === TYPESAFE.endpoint) {
			gateCalls += 1;
			if (gateFails) throw new Error("ECONNREFUSED");

			return Response.json({
				model: TYPESAFE.model,
				answers: { [TYPESAFE.gate.question]: { type: "noul", noul } },
			});
		}

		outsideCalls.push(url);
		throw new Error(`the expensive read reached ${url}`);
	}) as unknown as typeof fetch;
}

async function spendTheModelWindow(): Promise<void> {
	await writeAgentProvider(db, { provider: "chatgpt" });
	forgetProviderCache();
	markExhausted("chatgpt", Date.now(), Date.now() + 3 * DAY_MS);
}

async function describeTheBusiness(): Promise<void> {
	await writeWinBackRules(db, {
		...DEFAULT_WIN_BACK_RULES,
		business: {
			...DEFAULT_WIN_BACK_RULES.business,
			description: "We buy and sell Europaletten across Germany.",
		},
	});
}

async function queueThreads(count: number): Promise<string[]> {
	const ids: string[] = [];

	const contact = await db.contact.create({
		data: {
			firstName: "Anna",
			lastName: reason,
			email: `${suffix}@example.com`,
		},
		select: { id: true },
	});

	for (let index = 0; index < count; index += 1) {
		const thread = await db.emailThread.create({
			data: {
				rootMessageId: `root-${suffix}-${index}`,
				subject: `Newsletter ${index}`,
				contactId: contact.id,
				firstMessageAt: new Date("2026-09-13T09:00:00.000Z"),
				lastMessageAt: new Date("2026-09-14T09:00:00.000Z"),
				messageCount: 1,
				messages: {
					create: {
						rfcMessageId: `msg-${suffix}-${index}`,
						direction: "INBOUND",
						fromEmail: "news@example.com",
						fromName: "News",
						recipients: [],
						subject: `Newsletter ${index}`,
						body: "Unsere Angebote der Woche.",
						sentAt: new Date("2026-09-14T09:00:00.000Z"),
					},
				},
			},
			select: { id: true },
		});

		const task = await db.agentTask.create({
			data: {
				contactId: contact.id,
				kind: "thread-insight",
				reason,
				payload: { threadId: thread.id },
				priority: 10,
				budget: 1,
				dueAt: new Date(Date.now() - 1_000),
			},
			select: { id: true },
		});

		ids.push(task.id);
	}

	return ids;
}

async function clean(): Promise<void> {
	await db.agentTask.deleteMany({ where: { reason } });
	await db.contactMemory.deleteMany({
		where: { contact: { lastName: reason } },
	});
	await db.threadInsight.deleteMany({
		where: { thread: { rootMessageId: { startsWith: `root-${suffix}` } } },
	});
	await db.emailThread.deleteMany({
		where: { rootMessageId: { startsWith: `root-${suffix}` } },
	});
	await db.contact.deleteMany({ where: { lastName: reason } });
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
}

beforeAll(async () => {
	savedSetting = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });

	savedOpenrouter.clear();
	for (const key of OPENROUTER_KEYS) {
		const value = process.env[key];
		if (value !== undefined) savedOpenrouter.set(key, value);
		delete process.env[key];
	}

	codexHome = fakeCodexHome(true);
	stubFetch();
});

beforeEach(async () => {
	gateCalls = 0;
	outsideCalls = [];
	noul = 0.1;
	gateFails = false;
	lines.length = 0;
	forgetProviderCache();
	process.env[TYPESAFE.envVar] = KEY;
	console.error = (...args: unknown[]) => {
		lines.push(args.map(String).join(" "));
	};
	await clean();
});

afterEach(async () => {
	console.error = realError;
	await clean();
});

afterAll(async () => {
	globalThis.fetch = realFetch;
	console.error = realError;

	if (savedTypesafe === undefined) delete process.env[TYPESAFE.envVar];
	else process.env[TYPESAFE.envVar] = savedTypesafe;

	for (const key of OPENROUTER_KEYS) {
		const value = savedOpenrouter.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}

	codexHome?.restore();
	forgetProviderCache();

	if (savedSetting) {
		await db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: savedSetting,
			update: savedSetting,
		});
	}
});

function pauseLine(): string | undefined {
	return lines.find(
		(line) =>
			line.includes("reading paused until") && !line.includes("the cheap gate"),
	);
}

function clearedLine(): string | undefined {
	return lines.find((line) =>
		line.includes("the cheap gate is still clearing"),
	);
}

describe("the insight lane while no model works", () => {
	it("claims nothing and logs the pause when there is no TypeSafe key", async () => {
		delete process.env[TYPESAFE.envVar];
		await spendTheModelWindow();
		await describeTheBusiness();
		const [id] = await queueThreads(1);

		expect(await runInsightLane()).toBe(0);
		expect(gateCalls).toBe(0);

		const task = await db.agentTask.findUniqueOrThrow({
			where: { id: String(id) },
			select: { attempts: true, finishedAt: true },
		});

		expect(task.attempts).toBe(0);
		expect(task.finishedAt).toBeNull();
		expect(pauseLine()).toBeDefined();
		expect(clearedLine()).toBeUndefined();
	});

	it("clears a conversation the cheap gate says is not business", async () => {
		noul = 0.1;
		await spendTheModelWindow();
		await describeTheBusiness();
		const [id] = await queueThreads(1);

		expect(await runInsightLane()).toBe(1);
		expect(gateCalls).toBe(1);
		expect(outsideCalls).toEqual([]);

		const task = await db.agentTask.findUniqueOrThrow({
			where: { id: String(id) },
			select: { finishedAt: true, outcome: true },
		});

		expect(task.finishedAt).not.toBeNull();
		expect(task.outcome).toContain("Not about the business");

		const insight = await db.threadInsight.findFirstOrThrow({
			where: { thread: { rootMessageId: { startsWith: `root-${suffix}` } } },
			select: { relevant: true, modelId: true },
		});

		expect(insight.relevant).toBe(false);
		expect(insight.modelId).toBe("jev-latest");

		expect(clearedLine()).toContain("1 cleared and 0 wait for the full read");
		expect(pauseLine()).toBeUndefined();
	});

	it("returns a conversation the gate passes, without spending an attempt", async () => {
		noul = 0.9;
		await spendTheModelWindow();
		await describeTheBusiness();
		const [id] = await queueThreads(1);

		expect(await runInsightLane()).toBe(0);
		expect(gateCalls).toBe(1);
		expect(outsideCalls).toEqual([]);

		const task = await db.agentTask.findUniqueOrThrow({
			where: { id: String(id) },
			select: {
				attempts: true,
				finishedAt: true,
				dueAt: true,
				leasedUntil: true,
			},
		});

		expect(task.finishedAt).toBeNull();
		expect(task.attempts).toBe(0);
		expect(task.leasedUntil).toBeNull();
		expect(task.dueAt.getTime()).toBeGreaterThan(Date.now() + 60_000);

		expect(
			await db.threadInsight.count({
				where: { thread: { rootMessageId: { startsWith: `root-${suffix}` } } },
			}),
		).toBe(0);
	});

	it("stops after one pass when every conversation passes the gate", async () => {
		noul = 0.9;
		await spendTheModelWindow();
		await describeTheBusiness();
		await queueThreads(3);

		expect(await runInsightLane()).toBe(0);
		expect(gateCalls).toBe(3);

		expect(
			await db.agentTask.count({
				where: { reason, finishedAt: null, attempts: 0 },
			}),
		).toBe(3);
	});

	it("breaks and logs the pause when the gate itself fails", async () => {
		gateFails = true;
		await spendTheModelWindow();
		await describeTheBusiness();
		await queueThreads(2);

		expect(await runInsightLane()).toBe(0);
		expect(gateCalls).toBeGreaterThan(0);

		const tasks = await db.agentTask.findMany({
			where: { reason },
			select: { attempts: true, finishedAt: true },
		});

		expect(tasks.every((task) => task.finishedAt === null)).toBe(true);
		expect(tasks.every((task) => task.attempts === 0)).toBe(true);
		expect(pauseLine()).toBeDefined();
		expect(clearedLine()).toBeUndefined();
	});

	it("asks the gate nothing when no provider is set up at all", async () => {
		const empty = fakeCodexHome(false);
		forgetProviderCache();
		await describeTheBusiness();
		const [id] = await queueThreads(1);

		try {
			expect(await runInsightLane()).toBe(0);
		} finally {
			empty.restore();
			forgetProviderCache();
		}

		expect(gateCalls).toBe(0);
		expect(pauseLine()).toBeDefined();
		expect(clearedLine()).toBeUndefined();

		const task = await db.agentTask.findUniqueOrThrow({
			where: { id: String(id) },
			select: { attempts: true, finishedAt: true },
		});

		expect(task.attempts).toBe(0);
		expect(task.finishedAt).toBeNull();
	});

	it("breaks and logs the pause when the workspace describes no business", async () => {
		await spendTheModelWindow();
		await queueThreads(1);

		expect(await runInsightLane()).toBe(0);
		expect(gateCalls).toBe(0);
		expect(pauseLine()).toBeDefined();
	});
});

describe("the insight lane while a model works", () => {
	it("runs the normal path and logs neither pause line", async () => {
		noul = 0.1;
		await describeTheBusiness();
		await queueThreads(1);

		expect(await runInsightLane()).toBeGreaterThan(0);
		expect(gateCalls).toBe(1);

		const task = await db.agentTask.findFirstOrThrow({
			where: { reason },
			select: { attempts: true, finishedAt: true },
		});

		expect(task.attempts).toBe(1);
		expect(task.finishedAt).not.toBeNull();
		expect(pauseLine()).toBeUndefined();
		expect(clearedLine()).toBeUndefined();
	});
});
