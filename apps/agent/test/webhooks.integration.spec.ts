import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setSystemTime,
} from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@crm/db";
import {
	sealWebhookSecret,
	signWebhookBody,
	WEBHOOKS,
	webhookRetryDelayMs,
} from "@crm/db/webhooks";
import { runDirect } from "../agent/lib/dispatch";
import { cancelArchivedWork } from "../agent/lib/housekeeping";
import type { LeasedTask } from "../agent/lib/tasks";
import {
	deliverTask,
	queueWebhookDeliveries,
	runWebhookLane,
} from "../agent/lib/webhooks";

const REASON = "webhook-spec";
const SECRET = "webhook-spec-secret-value";
const TIMEOUT_MS = 300;

type Received = {
	body: string;
	headers: Record<string, string | undefined>;
};

const servers: Server[] = [];

async function listening(
	handle: (received: Received, answer: (status: number) => void) => void,
): Promise<string> {
	const server = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			handle(
				{
					body: Buffer.concat(chunks).toString("utf8"),
					headers: request.headers as Record<string, string | undefined>,
				},
				(status) => {
					response.writeHead(status);
					response.end("");
				},
			);
		});
	});
	servers.push(server);

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;

	return `http://127.0.0.1:${port}/${REASON}`;
}

async function clear() {
	const mine = await db.webhook.findMany({
		where: { url: { contains: REASON } },
		select: { id: true },
	});

	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ reason: { contains: REASON } },
				...mine.map((webhook) => ({
					kind: WEBHOOKS.kind,
					payload: { path: ["webhookId"], equals: webhook.id },
				})),
			],
		},
	});
	await db.webhook.deleteMany({ where: { url: { contains: REASON } } });
}

beforeEach(clear);

afterAll(async () => {
	await clear();
	for (const server of servers) server.close();
});

async function aWebhook(overrides: {
	url: string;
	enabled?: boolean;
	allowPrivateHost?: boolean;
	events?: string[];
}) {
	return db.webhook.create({
		data: {
			url: overrides.url,
			secret: sealWebhookSecret(SECRET),
			events: overrides.events ?? ["deal.created"],
			enabled: overrides.enabled ?? true,
			allowPrivateHost: overrides.allowPrivateHost ?? true,
		},
		select: { id: true },
	});
}

async function anEvent() {
	const dealId = `webhook-spec-deal-${crypto.randomUUID()}`;

	return db.agentTask.create({
		data: {
			kind: "agent-event",
			dealId,
			reason: REASON,
			priority: 700,
			budget: 1,
			dueAt: new Date(),
			payload: {
				type: "deal.created",
				record: { kind: "deal", id: dealId },
				occurredAt: new Date().toISOString(),
				data: { name: "A deal" },
			},
		},
		select: { id: true, payload: true },
	});
}

async function deliveriesOf(webhookId: string) {
	return db.agentTask.findMany({
		where: {
			kind: WEBHOOKS.kind,
			payload: { path: ["webhookId"], equals: webhookId },
		},
	});
}

async function leaseOf(taskId: string): Promise<LeasedTask> {
	const task = await db.agentTask.findUniqueOrThrow({ where: { id: taskId } });
	return task as LeasedTask;
}

describe("an event reaching a webhook", () => {
	it("queues a delivery for an enabled webhook and not for a disabled one", async () => {
		const url = await listening((_received, answer) => answer(200));
		const enabled = await aWebhook({ url });
		const disabled = await aWebhook({ url, enabled: false });
		const other = await aWebhook({ url, events: ["contact.created"] });

		const event = await anEvent();
		const queued = await queueWebhookDeliveries(event);

		expect(queued).toBe(1);
		expect(await deliveriesOf(enabled.id)).toHaveLength(1);
		expect(await deliveriesOf(disabled.id)).toHaveLength(0);
		expect(await deliveriesOf(other.id)).toHaveLength(0);
	});

	it("queues one delivery however often the event task is read", async () => {
		const url = await listening((_received, answer) => answer(200));
		const webhook = await aWebhook({ url });
		const event = await anEvent();

		expect(await queueWebhookDeliveries(event)).toBe(1);
		expect(await queueWebhookDeliveries(event)).toBe(0);
		expect(await deliveriesOf(webhook.id)).toHaveLength(1);
	});

	it("sends a signature the receiver can compute for itself", async () => {
		let received: Received | null = null;
		const url = await listening((message, answer) => {
			received = message;
			answer(200);
		});
		const webhook = await aWebhook({ url });
		const event = await anEvent();
		await queueWebhookDeliveries(event);

		expect(await runWebhookLane(undefined, TIMEOUT_MS)).toBe(1);

		const message = received as Received | null;
		if (!message) throw new Error("The receiver was never called.");

		const timestamp = message.headers[WEBHOOKS.headers.timestamp] ?? "";
		expect(message.headers[WEBHOOKS.headers.signature]).toBe(
			signWebhookBody(message.body, SECRET, timestamp),
		);
		expect(message.headers[WEBHOOKS.headers.event]).toBe("deal.created");
		expect(JSON.parse(message.body).type).toBe("deal.created");

		const [delivery] = await deliveriesOf(webhook.id);
		expect(delivery?.finishedAt).not.toBeNull();
		expect(
			await db.webhook.findUniqueOrThrow({ where: { id: webhook.id } }),
		).toMatchObject({ lastStatus: 200, lastError: null });
	});

	it("refuses a private address while the webhook does not allow one", async () => {
		const url = await listening((_received, answer) => answer(200));
		const webhook = await aWebhook({ url, allowPrivateHost: false });
		const event = await anEvent();
		await queueWebhookDeliveries(event);

		await runWebhookLane(undefined, TIMEOUT_MS);

		const [delivery] = await deliveriesOf(webhook.id);
		expect(delivery?.finishedAt).toBeNull();
		expect(
			(await db.webhook.findUniqueOrThrow({ where: { id: webhook.id } }))
				.lastError,
		).toContain("public");
	});
});

describe("a webhook with a plain http address on a public host", () => {
	it("fails with a clear error and sends nothing", async () => {
		const webhook = await aWebhook({
			url: `http://1.1.1.1/${REASON}`,
			allowPrivateHost: true,
		});
		const event = await anEvent();
		await queueWebhookDeliveries(event);

		await runWebhookLane(undefined, TIMEOUT_MS);

		const row = await db.webhook.findUniqueOrThrow({
			where: { id: webhook.id },
		});
		expect(row.lastError).toContain("https");
		expect(row.lastStatus).toBeNull();
		expect(row.lastDeliveryAt).not.toBeNull();
	});

	it("still delivers over http to an address on the own network when allowed", async () => {
		let calls = 0;
		const url = await listening((_received, answer) => {
			calls += 1;
			answer(200);
		});
		await aWebhook({ url, allowPrivateHost: true });
		const event = await anEvent();
		await queueWebhookDeliveries(event);

		await runWebhookLane(undefined, TIMEOUT_MS);

		expect(calls).toBe(1);
	});
});

describe("a receiver that never answers", () => {
	it("does not hold the event lane", async () => {
		const url = await listening(() => {});
		const webhook = await aWebhook({ url });
		const event = await anEvent();

		const started = Date.now();
		await runDirect(await leaseOf(event.id));
		const eventTask = await db.agentTask.findUniqueOrThrow({
			where: { id: event.id },
		});

		expect(eventTask.finishedAt).not.toBeNull();
		expect(Date.now() - started).toBeLessThan(3_000);
		expect(await deliveriesOf(webhook.id)).toHaveLength(1);
	});

	it("gives the delivery up after its own timeout", async () => {
		const url = await listening(() => {});
		const webhook = await aWebhook({ url });
		const event = await anEvent();
		await queueWebhookDeliveries(event);

		const started = Date.now();
		await runWebhookLane(undefined, TIMEOUT_MS);

		expect(Date.now() - started).toBeLessThan(WEBHOOKS.deliver.timeoutMs);
		const [delivery] = await deliveriesOf(webhook.id);
		expect(delivery?.finishedAt).toBeNull();
	});
});

describe("a receiver that keeps failing", () => {
	const MINUTE = 60_000;
	const HOUR = 60 * MINUTE;

	afterEach(() => setSystemTime());

	async function queued(webhookId: string) {
		const [delivery] = await deliveriesOf(webhookId);
		if (!delivery) throw new Error("Nothing was queued.");
		return delivery;
	}

	it("retries after one minute, not at once, and delivers on the third attempt", async () => {
		let calls = 0;
		const deliveryIds: Array<string | undefined> = [];
		const url = await listening((received, answer) => {
			calls += 1;
			deliveryIds.push(received.headers[WEBHOOKS.headers.delivery]);
			answer(calls <= 2 ? 500 : 200);
		});
		const webhook = await aWebhook({ url });
		await queueWebhookDeliveries(await anEvent());
		const start = Date.now();

		try {
			await runWebhookLane(undefined, TIMEOUT_MS);
			expect(calls).toBe(1);
			expect((await queued(webhook.id)).dueAt.getTime()).toBeGreaterThanOrEqual(
				start + MINUTE,
			);

			await runWebhookLane(undefined, TIMEOUT_MS);
			expect(calls).toBe(1);

			setSystemTime(new Date(start + 2 * MINUTE));
			await runWebhookLane(undefined, TIMEOUT_MS);
			expect(calls).toBe(2);
			expect((await queued(webhook.id)).finishedAt).toBeNull();

			setSystemTime(new Date(start + 2 * MINUTE + 5 * MINUTE));
			await runWebhookLane(undefined, TIMEOUT_MS);
			expect(calls).toBe(2);

			setSystemTime(new Date(start + 2 * MINUTE + 11 * MINUTE));
			await runWebhookLane(undefined, TIMEOUT_MS);
			expect(calls).toBe(3);
		} finally {
			setSystemTime();
		}

		const delivery = await queued(webhook.id);
		expect(delivery.finishedAt).not.toBeNull();
		expect(delivery.outcome).not.toContain("Gave up");
		expect(new Set(deliveryIds).size).toBe(1);
	});

	it("stops after six attempts and waits the backoff between them", async () => {
		let calls = 0;
		const url = await listening((_received, answer) => {
			calls += 1;
			answer(500);
		});
		const webhook = await aWebhook({ url });
		await queueWebhookDeliveries(await anEvent());
		let clock = Date.now();

		try {
			for (let attempt = 1; attempt <= 8; attempt += 1) {
				setSystemTime(new Date(clock));
				await runWebhookLane(undefined, TIMEOUT_MS);
				const delivery = await queued(webhook.id);
				if (delivery.finishedAt) break;
				expect(delivery.dueAt.getTime()).toBeGreaterThanOrEqual(
					clock + webhookRetryDelayMs(attempt),
				);
				clock = delivery.dueAt.getTime() + 1;
			}
		} finally {
			setSystemTime();
		}

		expect(calls).toBe(WEBHOOKS.deliver.maxAttempts);
		const delivery = await queued(webhook.id);
		expect(delivery.finishedAt).not.toBeNull();
		expect(delivery.outcome).toContain("Gave up after 6");
		expect(
			(await db.webhook.findUniqueOrThrow({ where: { id: webhook.id } }))
				.lastStatus,
		).toBe(500);
	});

	it("steps the delay 1 minute, 10 minutes, 2 hours and keeps the last", () => {
		expect([1, 2, 3, 4, 5].map(webhookRetryDelayMs)).toEqual([
			MINUTE,
			10 * MINUTE,
			2 * HOUR,
			2 * HOUR,
			2 * HOUR,
		]);
	});
});

describe("a webhook that disappears while a delivery is in flight", () => {
	it("settles the event as delivered and does not send it again", async () => {
		let calls = 0;
		const webhook = { id: "" };
		const url = await listening(async (_received, answer) => {
			calls += 1;
			await db.webhook.delete({ where: { id: webhook.id } });
			answer(200);
		});
		webhook.id = (await aWebhook({ url })).id;
		await queueWebhookDeliveries(await anEvent());
		const [queuedDelivery] = await deliveriesOf(webhook.id);
		if (!queuedDelivery) throw new Error("Nothing was queued.");

		await deliverTask(await leaseOf(queuedDelivery.id), TIMEOUT_MS);

		const delivery = await db.agentTask.findUniqueOrThrow({
			where: { id: queuedDelivery.id },
		});
		expect(calls).toBe(1);
		expect(delivery.finishedAt).not.toBeNull();
		expect(delivery.outcome).not.toContain("Gave up");

		await runWebhookLane(undefined, TIMEOUT_MS);
		expect(calls).toBe(1);
	});
});

describe("a delivery task", () => {
	it("stops when the webhook is switched off after the event", async () => {
		const url = await listening((_received, answer) => answer(200));
		const webhook = await aWebhook({ url });
		const event = await anEvent();
		await queueWebhookDeliveries(event);
		await db.webhook.update({
			where: { id: webhook.id },
			data: { enabled: false },
		});

		const [queued] = await deliveriesOf(webhook.id);
		if (!queued) throw new Error("Nothing was queued.");
		await deliverTask(await leaseOf(queued.id), TIMEOUT_MS);

		const [delivery] = await deliveriesOf(webhook.id);
		expect(delivery?.outcome).toBe("The webhook is switched off.");
	});
});

describe("a delivery for a record that is purged", () => {
	const records = [
		{ type: "contact.created", kind: "contact", column: "contactId" },
		{ type: "company.created", kind: "company", column: "companyId" },
		{ type: "deal.created", kind: "deal", column: "dealId" },
	] as const;

	async function anEventFor(record: (typeof records)[number]) {
		const id = `webhook-spec-${record.kind}-${crypto.randomUUID()}`;

		const task = await db.agentTask.create({
			data: {
				kind: "agent-event",
				[record.column]: id,
				reason: REASON,
				priority: 700,
				budget: 1,
				dueAt: new Date(),
				payload: {
					type: record.type,
					record: { kind: record.kind, id },
					occurredAt: new Date().toISOString(),
					data: { name: "Preview Person", email: "preview@example.com" },
				},
			},
			select: { id: true, payload: true },
		});

		return { id, task };
	}

	for (const record of records) {
		it(`carries the ${record.kind} id, so the purge takes it and nothing is sent`, async () => {
			let calls = 0;
			const url = await listening((_received, answer) => {
				calls += 1;
				answer(200);
			});
			const webhook = await aWebhook({ url, events: [record.type] });
			const event = await anEventFor(record);

			expect(await queueWebhookDeliveries(event.task)).toBe(1);

			const [delivery] = await deliveriesOf(webhook.id);
			expect(delivery?.[record.column]).toBe(event.id);

			await db.agentTask.deleteMany({ where: { [record.column]: event.id } });

			await runWebhookLane(undefined, TIMEOUT_MS);

			expect(calls).toBe(0);
			expect(await deliveriesOf(webhook.id)).toHaveLength(0);
		});
	}
});

describe("a delivery waiting for a retry on an archived record", () => {
	it("stays open, because the event is not research about the record", async () => {
		const contactId = `webhook-spec-contact-${crypto.randomUUID()}`;
		const email = `${contactId}@example.com`;
		await db.contact.create({
			data: {
				id: contactId,
				firstName: "Preview",
				email,
				archivedAt: new Date(),
			},
		});

		try {
			const url = await listening((_received, answer) => answer(500));
			const webhook = await aWebhook({ url, events: ["contact.created"] });
			const task = await db.agentTask.create({
				data: {
					kind: "agent-event",
					contactId,
					reason: REASON,
					priority: 700,
					budget: 1,
					dueAt: new Date(),
					payload: {
						type: "contact.created",
						record: { kind: "contact", id: contactId },
						occurredAt: new Date().toISOString(),
						data: { name: "Preview Person", email },
					},
				},
				select: { id: true, payload: true },
			});
			await queueWebhookDeliveries(task);
			await runWebhookLane(undefined, TIMEOUT_MS);

			await cancelArchivedWork();

			const [delivery] = await deliveriesOf(webhook.id);
			expect(delivery?.finishedAt).toBeNull();
		} finally {
			await db.contact.deleteMany({ where: { id: contactId } });
		}
	});
});
