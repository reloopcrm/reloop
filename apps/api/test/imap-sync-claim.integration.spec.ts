import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, GoogleSyncStatus } from "@crm/db";
import { SyncStateService } from "../src/mailbox/sync-state.service";

const suffix = process.env.TEST_RUN_ID ?? "imap-claim-spec";
const userId = `imap-claim-${suffix}`;
const source = `imap:claim-${suffix}`;
const state = new SyncStateService(db);

const MINUTE_MS = 60_000;

async function clean() {
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function fresh() {
	return db.mailboxSync.findUniqueOrThrow({
		where: { userId_source: { userId, source } },
	});
}

function isDue(rows: { id: string }[], id: string) {
	return rows.some((row) => row.id === id);
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: {
			id: userId,
			name: "Claim Rep",
			email: `claim-${suffix}@example.com`,
		},
	});
});

beforeEach(async () => {
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.mailboxSync.create({
		data: { userId, source, status: GoogleSyncStatus.IDLE },
	});
});

afterAll(clean);

describe("a manual IMAP sync and the sync tick", () => {
	it("keeps the tick away from a mailbox a manual sync holds", async () => {
		const row = await fresh();

		expect(await state.claimManual(row.id, new Date())).toBe(true);

		const held = await fresh();
		expect(held.status).toBe(GoogleSyncStatus.RUNNING);
		expect(await state.claim(held, new Date())).toBe(false);
		expect(isDue(await state.due(new Date()), row.id)).toBe(false);
	});

	it("keeps a manual sync away from a mailbox the tick holds", async () => {
		const row = await fresh();

		expect(await state.claim(row, new Date())).toBe(true);
		expect(await state.claimManual(row.id, new Date())).toBe(false);
	});

	it("lets a manual sync take a mailbox whose lease ran out", async () => {
		const row = await fresh();
		await state.claim(row, new Date());

		const later = new Date(Date.now() + 10 * MINUTE_MS);
		expect(await state.claimManual(row.id, later)).toBe(true);
	});

	it("lets a manual sync override a backoff and a reconnect state", async () => {
		const row = await fresh();

		await state.markRateLimited(row.id, 10 * MINUTE_MS, "refused");
		expect(await state.claimManual(row.id, new Date())).toBe(true);

		await state.markNeedsReconnect(row.id, "refused");
		expect(await state.claimManual(row.id, new Date())).toBe(true);
	});
});

describe("a temporary IMAP failure", () => {
	it("comes back by itself once the backoff passes", async () => {
		const row = await fresh();

		await state.markRateLimited(row.id, 5 * MINUTE_MS);

		const waiting = await fresh();
		expect(waiting.status).toBe(GoogleSyncStatus.IDLE);
		expect(waiting.lastError).toBeNull();
		expect(isDue(await state.due(new Date()), row.id)).toBe(false);
		expect(
			isDue(await state.due(new Date(Date.now() + 6 * MINUTE_MS)), row.id),
		).toBe(true);
	});

	it("keeps a lasting failure visible and still retries it", async () => {
		const row = await fresh();

		await state.markFailed(row.id, "unreachable", 5 * MINUTE_MS);

		const failed = await fresh();
		expect(failed.status).toBe(GoogleSyncStatus.FAILED);
		expect(failed.lastError).toBe("unreachable");
		expect(isDue(await state.due(new Date()), row.id)).toBe(false);
		expect(
			isDue(await state.due(new Date(Date.now() + 6 * MINUTE_MS)), row.id),
		).toBe(true);
	});
});
