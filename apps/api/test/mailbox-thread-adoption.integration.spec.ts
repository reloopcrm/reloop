import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { THREAD_CLASSIFICATION } from "@crm/db/insights";
import { SETTINGS_ID } from "@crm/db/settings";
import { ADOPTION } from "../src/mailbox/mailbox.config";
import { ThreadAdoptionService } from "../src/mailbox/thread-adoption.service";
import type { ThreadWriterService } from "../src/mailbox/thread-writer.service";

const suffix = process.env.TEST_RUN_ID ?? "thread-adoption-spec";
const rootEnd = `-${suffix}@mail.example>`;
const newest = new Date("2099-01-01T00:00:00Z").getTime();
const MINUTE_MS = 60_000;

const adopted: string[] = [];

const writer = {
	context: async () => ({}),
	adopt: async (threadId: string) => {
		adopted.push(threadId);
		return true;
	},
} as unknown as ThreadWriterService;

const service = new ThreadAdoptionService(db, writer);

let settingsExisted = false;
let cursorBefore: string | null = null;
let counter = 0;

async function waitingThread(at: Date, adoptable: boolean): Promise<string> {
	counter += 1;
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `<thread-${counter}${rootEnd}`,
			subject: "Angebot Paletten",
			classification: THREAD_CLASSIFICATION.relevant,
			firstMessageAt: at,
			lastMessageAt: at,
			messageCount: 1,
		},
		select: { id: true },
	});
	if (adoptable) {
		await db.threadInsight.create({
			data: {
				threadId: thread.id,
				relevant: true,
				topics: [],
				products: [],
				outcome: "DEAL_DONE",
				summary: "",
				evidence: [],
				modelId: "test",
				lastMessageAt: at,
			},
		});
	}
	return thread.id;
}

async function clean() {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: rootEnd } },
	});
}

async function resetCursor() {
	await db.appSetting.updateMany({
		where: { id: SETTINGS_ID },
		data: { threadAdoptionCursor: null },
	});
}

beforeAll(async () => {
	await clean();
	const settings = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { threadAdoptionCursor: true },
	});
	settingsExisted = settings !== null;
	cursorBefore = settings?.threadAdoptionCursor ?? null;
});

beforeEach(async () => {
	adopted.length = 0;
	await clean();
	await resetCursor();
});

afterAll(async () => {
	await clean();
	if (settingsExisted) {
		await db.appSetting.update({
			where: { id: SETTINGS_ID },
			data: { threadAdoptionCursor: cursorBefore },
		});
	} else {
		await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	}
});

describe("adopting relevant threads", () => {
	it("reaches an older adoptable thread behind a full batch of newer threads that are not worth adopting", async () => {
		for (let index = 0; index <= ADOPTION.batch; index += 1) {
			await waitingThread(new Date(newest - index * MINUTE_MS), false);
		}
		const older = await waitingThread(new Date("2026-09-01T10:00:00Z"), true);

		for (let tick = 0; tick < 3 && !adopted.includes(older); tick += 1) {
			await service.adoptRelevant();
		}

		expect(adopted).toEqual([older]);
	});

	it("adopts a new adoptable thread on the next tick while the cursor is deep in the waiting threads", async () => {
		for (let index = 0; index < ADOPTION.batch * 2; index += 1) {
			await waitingThread(new Date(newest - (index + 1) * MINUTE_MS), false);
		}
		await service.adoptRelevant();

		const fresh = await waitingThread(new Date(newest), true);
		await service.adoptRelevant();

		expect(adopted).toEqual([fresh]);
	});
});
