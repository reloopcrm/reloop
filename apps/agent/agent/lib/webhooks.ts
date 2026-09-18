import { db } from "@crm/db";
import { MAX_ATTEMPTS } from "@crm/db/agent-tasks";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { safeFetch } from "@crm/db/safe-fetch";
import { openWebhookSecret, signWebhookBody, WEBHOOKS } from "@crm/db/webhooks";
import { crmEventTask } from "@crm/validation/agent-events";
import { z } from "zod";
import { runLimited } from "./pool";
import { claimDue, completeTask, type LeasedTask } from "./tasks";

const webhookDelivery = z.object({
	deliveryKey: z.string().trim().min(1),
	webhookId: z.string().trim().min(1),
	event: crmEventTask,
});

type WebhookDelivery = z.infer<typeof webhookDelivery>;

export async function queueWebhookDeliveries(
	task: Pick<LeasedTask, "id" | "payload">,
): Promise<number> {
	const event = crmEventTask.safeParse(task.payload);
	if (!event.success) throw new Error("The queued agent event is invalid.");

	const webhooks = await db.webhook.findMany({
		where: { enabled: true, events: { has: event.data.type } },
		orderBy: { id: "asc" },
		select: { id: true },
	});

	let queued = 0;

	for (const webhook of webhooks) {
		const deliveryKey = `webhook:${task.id}:${webhook.id}`;
		const created = await db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, deliveryKey);

			const existing = await tx.agentTask.findFirst({
				where: {
					kind: WEBHOOKS.kind,
					payload: { path: ["deliveryKey"], equals: deliveryKey },
				},
				select: { id: true },
			});
			if (existing) return false;

			await tx.agentTask.create({
				data: {
					kind: WEBHOOKS.kind,
					reason: `${event.data.type} to a webhook`,
					priority: WEBHOOKS.priority,
					budget: 1,
					dueAt: new Date(),
					payload: {
						deliveryKey,
						webhookId: webhook.id,
						event: event.data,
					} satisfies WebhookDelivery,
				},
			});
			return true;
		});

		if (created) queued += 1;
	}

	return queued;
}

export async function runWebhookLane(
	signal?: AbortSignal,
	timeoutMs: number = WEBHOOKS.deliver.timeoutMs,
): Promise<number> {
	let handled = 0;

	while (handled < WEBHOOKS.deliver.batch) {
		if (signal?.aborted) break;

		const tasks = await claimDue(
			Math.min(WEBHOOKS.deliver.concurrency, WEBHOOKS.deliver.batch - handled),
			{ only: [WEBHOOKS.kind] },
			WEBHOOKS.deliver.leaseMs,
		);
		if (tasks.length === 0) break;

		await runLimited(
			WEBHOOKS.deliver.concurrency,
			tasks,
			async (task) => {
				try {
					await deliverTask(task, timeoutMs);
				} catch (error) {
					console.error(
						`[agent] ⨯ webhook ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			},
			signal,
		);
		handled += tasks.length;
	}

	return handled;
}

export async function deliverTask(
	task: LeasedTask,
	timeoutMs: number = WEBHOOKS.deliver.timeoutMs,
): Promise<void> {
	const parsed = webhookDelivery.safeParse(task.payload);
	if (!parsed.success) {
		await completeTask(task.id, "The queued webhook delivery is unreadable.");
		return;
	}

	const webhook = await db.webhook.findUnique({
		where: { id: parsed.data.webhookId },
	});
	if (!webhook) {
		await completeTask(task.id, "The webhook is gone.");
		return;
	}
	if (!webhook.enabled) {
		await completeTask(task.id, "The webhook is switched off.");
		return;
	}

	const outcome = await send(
		{
			url: webhook.url,
			secret: webhook.secret,
			allowPrivateHost: webhook.allowPrivateHost,
		},
		parsed.data,
		timeoutMs,
	);

	await db.webhook.update({
		where: { id: webhook.id },
		data: {
			lastDeliveryAt: new Date(),
			lastStatus: outcome.status,
			lastError: outcome.delivered ? null : outcome.reason,
		},
	});

	if (outcome.delivered) {
		await completeTask(task.id, `The receiver answered ${outcome.status}.`);
		return;
	}

	if (task.attempts >= MAX_ATTEMPTS) {
		await completeTask(
			task.id,
			`Gave up after ${MAX_ATTEMPTS} attempts: ${outcome.reason}`,
		);
	}
}

type SendOutcome =
	| { delivered: true; status: number; reason: null }
	| { delivered: false; status: number | null; reason: string };

async function send(
	webhook: { url: string; secret: string; allowPrivateHost: boolean },
	delivery: WebhookDelivery,
	timeoutMs: number,
): Promise<SendOutcome> {
	let secret: string;
	try {
		secret = openWebhookSecret(webhook.secret);
	} catch {
		return {
			delivered: false,
			status: null,
			reason: "The stored secret cannot be read. Enter it again.",
		};
	}

	const body = JSON.stringify({
		id: delivery.deliveryKey,
		type: delivery.event.type,
		occurredAt: delivery.event.occurredAt,
		record: delivery.event.record,
		data: delivery.event.data,
	});
	const timestamp = String(Date.now());

	const result = await safeFetch(webhook.url, {
		method: "POST",
		body,
		timeoutMs,
		allowPrivateHost: webhook.allowPrivateHost,
		headers: {
			"content-type": "application/json",
			[WEBHOOKS.headers.event]: delivery.event.type,
			[WEBHOOKS.headers.delivery]: delivery.deliveryKey,
			[WEBHOOKS.headers.timestamp]: timestamp,
			[WEBHOOKS.headers.signature]: signWebhookBody(body, secret, timestamp),
		},
	});

	if (!result) {
		return {
			delivered: false,
			status: null,
			reason: webhook.allowPrivateHost
				? "The receiver did not answer in time."
				: "The receiver did not answer in time, or its address is not a public one.",
		};
	}

	await result.response.body?.cancel().catch(() => undefined);
	const status = result.response.status;

	return status >= 200 && status < 300
		? { delivered: true, status, reason: null }
		: {
				delivered: false,
				status,
				reason: `The receiver answered ${status}.`,
			};
}
