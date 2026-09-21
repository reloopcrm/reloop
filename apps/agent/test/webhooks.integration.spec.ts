import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@crm/db";
import { MAX_ATTEMPTS } from "@crm/db/agent-tasks";
import { sealWebhookSecret, signWebhookBody, WEBHOOKS } from "@crm/db/webhooks";
import { runDirect } from "../agent/lib/dispatch";
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

		console.error(
			"[diag]",
			JSON.stringify(await deliveriesOf(webhook.id), null, 0),
		);
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
		console.error(
			"[diag]",
			JSON.stringify(await deliveriesOf(webhook.id), null, 0),
		);

		const [delivery] = await deliveriesOf(webhook.id);
		expect(delivery?.finishedAt).toBeNull();
		expect(
			(await db.webhook.findUniqueOrThrow({ where: { id: webhook.id } }))
				.lastError,
		).toContain("public");
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
		console.error(
			"[diag]",
			JSON.stringify(await deliveriesOf(webhook.id), null, 0),
		);
		const [delivery] = await deliveriesOf(webhook.id);
		expect(delivery?.finishedAt).toBeNull();
	});
});

describe("a receiver that keeps failing", () => {
	it("stops after three attempts", async () => {
		let calls = 0;
		const url = await listening((_received, answer) => {
			calls += 1;
			answer(500);
		});
		const webhook = await aWebhook({ url });
		const event = await anEvent();
		await queueWebhookDeliveries(event);

		const [queued] = await deliveriesOf(webhook.id);
		if (!queued) throw new Error("Nothing was queued.");

		for (let attempt = 1; attempt <= MAX_ATTEMPTS + 1; attempt += 1) {
			await db.agentTask.updateMany({
				where: { id: queued.id, finishedAt: null },
				data: { leasedUntil: null },
			});
			await runWebhookLane(undefined, TIMEOUT_MS);
		}

		console.error(
			"[diag]",
			JSON.stringify(await deliveriesOf(webhook.id), null, 0),
		);
		expect(calls).toBe(MAX_ATTEMPTS);

		const [delivery] = await deliveriesOf(webhook.id);
		expect(delivery?.attempts).toBe(MAX_ATTEMPTS);
		expect(delivery?.finishedAt).not.toBeNull();
		expect(delivery?.outcome).toContain("Gave up");
		expect(
			(await db.webhook.findUniqueOrThrow({ where: { id: webhook.id } }))
				.lastStatus,
		).toBe(500);
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
