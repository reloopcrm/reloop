import { type Db, type FieldEntity, Prisma } from "@crm/db";
import {
	COMPANY_PROFILE_BUDGET,
	PRIORITY,
	USAGE_PROBE_KIND,
} from "@crm/db/agent-tasks";
import { CRM_EVENT_CATALOG, type CrmEventType } from "@crm/db/crm-events";
import { RECORD_ID_COLUMNS } from "@crm/db/fields";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { planIdOf } from "@crm/db/plan-usage";
import {
	allowsCompanyResearch,
	limitsOf,
	monthlyBudget,
	startOfMonth,
} from "@crm/db/plans";
import { isSampleRecordId } from "@crm/db/sample-data";
import { forEachTenant } from "@crm/db/tenancy";
import { currentTenantId, tenantScopedKey } from "@crm/db/tenant-context";
import {
	isTaskKindEnabled,
	readAgentFunctions,
} from "@crm/validation/agent-functions";
import {
	AGENT_TASK_THREAD_ID_KEY,
	type AgentTaskDraftPayload,
	type AgentTaskOrigin,
	type AgentTaskThreadPayload,
} from "@crm/validation/agent-task-payload";
import { fieldBackfillPayload } from "@crm/validation/field-backfill";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { AGENT_DISPATCH } from "./agent-dispatch.config";
import { bridge } from "./bridge";

export type CrmEventInput = {
	[Type in CrmEventType]: {
		type: Type;
		record: {
			kind: (typeof CRM_EVENT_CATALOG)[Type]["recordKind"];
			id: string;
		};
		occurredAt: Date;
		data: Prisma.InputJsonObject;
	};
}[CrmEventType];

export type AgentTaskQueue = {
	slackChannelJoinRequested: (
		channelId: string,
		channelName: string,
	) => Promise<void>;
};

async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	run: (item: T) => Promise<void>,
): Promise<void> {
	const queue = items[Symbol.iterator]();
	const width = Math.max(1, Math.min(concurrency, items.length));

	await Promise.all(
		Array.from({ length: width }, async () => {
			for (const item of queue) await run(item);
		}),
	);
}

const TENANT_HEADER = "x-reloop-tenant";

function tenantOfThisRequest(): string | null {
	try {
		return currentTenantId();
	} catch {
		return null;
	}
}

@Injectable()
export class AgentTriggerService {
	private readonly logger = new Logger(AgentTriggerService.name);
	private readonly cancellationsDelivered = new Set<string>();

	constructor(@InjectDatabase() private readonly db: Db) {}

	async companyCreated(
		companyId: string,
		reason = "New company",
	): Promise<void> {
		await this.enqueue({
			companyId,
			kind: "brand",
			reason,
			priority: PRIORITY.brand,
			budget: 2,
		});

		await this.enqueue({
			companyId,
			kind: "company-profile",
			reason,
			priority: PRIORITY.companyProfile,
			budget: COMPANY_PROFILE_BUDGET,
		});
	}

	async companyRequested(companyId: string, reason: string): Promise<boolean> {
		const brand = await this.enqueue(
			{
				companyId,
				kind: "brand",
				reason,
				priority: PRIORITY.brand,
				budget: 2,
			},
			true,
		);

		const profile = await this.enqueue(
			{
				companyId,
				kind: "company-profile",
				reason,
				priority: PRIORITY.requested,
				budget: 8,
			},
			true,
		);

		return brand || profile;
	}

	async workspaceChanged(website: string, reason: string): Promise<void> {
		await this.enqueue({
			kind: "workspace-profile",
			reason: `${reason} (${website})`,
			priority: PRIORITY.workspace,
			budget: 4,
		});
	}

	async contactCreated(
		contactId: string,
		reason: string,
		required = false,
	): Promise<boolean> {
		return this.enqueue(
			{
				contactId,
				kind: "identify",
				reason,
				priority: PRIORITY.identify,
				budget: 4,
			},
			required,
		);
	}

	async threadStored(
		threadId: string,
		reason: string,
		origin: AgentTaskOrigin = "forward",
	): Promise<void> {
		const priority =
			origin === "backfill"
				? PRIORITY.threadInsightBackfill
				: PRIORITY.threadInsight;
		const created = await this.enqueue({
			kind: "thread-insight",
			reason,
			priority,
			budget: 1,
			payload: { threadId, origin } satisfies AgentTaskThreadPayload,
			subject: { path: [AGENT_TASK_THREAD_ID_KEY], value: threadId },
		});
		if (created || origin === "backfill") return;

		await this.db.agentTask.updateMany({
			where: {
				kind: "thread-insight",
				finishedAt: null,
				priority: { lt: priority },
				payload: { path: [AGENT_TASK_THREAD_ID_KEY], equals: threadId },
			},
			data: { priority, reason },
		});
	}

	async threadDigestRequested(threadId: string): Promise<boolean> {
		return this.enqueue({
			kind: "thread-digest",
			reason: "Summarise every message in a conversation someone opened",
			priority: PRIORITY.threadDigest,
			budget: 1,
			payload: { threadId } satisfies AgentTaskThreadPayload,
			subject: { path: [AGENT_TASK_THREAD_ID_KEY], value: threadId },
		});
	}

	async emailDraftRequested(
		contactId: string,
		instruction?: string | null,
	): Promise<boolean> {
		return this.enqueue({
			contactId,
			kind: "email-draft",
			reason: instruction
				? "A rep said what they want different in their email"
				: "A rep asked for an email they can send to this contact",
			priority: PRIORITY.emailDraft,
			budget: 1,
			payload: instruction
				? ({ instruction } satisfies AgentTaskDraftPayload)
				: undefined,
		});
	}

	async usageProbeRequested(): Promise<boolean> {
		return this.enqueue({
			kind: USAGE_PROBE_KIND,
			reason: "Refresh the subscription limit",
			priority: PRIORITY.usageProbe,
			budget: 1,
			subject: { path: ["scope"], value: "usage" },
			payload: { scope: "usage" },
		});
	}

	async businessSetupRequested(fresh = false): Promise<boolean> {
		const asked = fresh
			? null
			: await this.db.agentTask.findFirst({
					where: {
						kind: "business-setup",
						finishedAt: {
							gte: new Date(
								Date.now() - AGENT_DISPATCH.businessSetup.askAgainAfterMs,
							),
						},
					},
					select: { id: true },
				});
		if (asked) return false;

		return this.enqueue({
			kind: "business-setup",
			reason: "Work out what this company trades",
			priority: PRIORITY.businessSetup,
			budget: 1,
			subject: { path: ["scope"], value: "business" },
			payload: { scope: "business" },
		});
	}

	async rulesTuneRequested(reason: string): Promise<boolean> {
		return this.enqueue({
			kind: "rules-tune",
			reason,
			priority: PRIORITY.rulesTune,
			budget: 1,
			subject: { path: ["scope"], value: "win-back" },
			payload: { scope: "win-back" },
		});
	}

	async slackPeopleRequested(reason: string, required = false): Promise<void> {
		await this.enqueue(
			{
				kind: "slack-people-match",
				reason,
				priority: PRIORITY.slackPeople,
				budget: 1,
			},
			required,
		);
	}

	async slackChannelJoinRequested(
		channelId: string,
		channelName: string,
	): Promise<void> {
		await this.queueSlackChannelJoin(channelId, channelName);
	}

	async withTasks<Result>(
		work: (
			tx: Prisma.TransactionClient,
			queue: AgentTaskQueue,
		) => Promise<Result>,
	): Promise<Result> {
		let queued = false;

		const result = await this.db.$transaction((tx) =>
			work(tx, {
				slackChannelJoinRequested: async (channelId, channelName) => {
					const created = await this.queueSlackChannelJoin(
						channelId,
						channelName,
						tx,
					);
					queued = queued || created;
				},
			}),
		);

		if (queued) this.poke();

		return result;
	}

	private queueSlackChannelJoin(
		channelId: string,
		channelName: string,
		client?: Prisma.TransactionClient,
	): Promise<boolean> {
		return this.enqueue(
			{
				kind: "slack-channel-join",
				reason: `Add the CRM to #${channelName}`,
				priority: PRIORITY.slackJoin,
				budget: 1,
				subject: { path: ["channelId"], value: channelId },
				payload: {
					type: "slack.channel.join",
					channelId,
					channelName,
				},
			},
			true,
			client,
		);
	}

	async withCrmEvents<Result>(
		work: (
			tx: Prisma.TransactionClient,
			emit: (input: CrmEventInput) => Promise<void>,
		) => Promise<Result>,
	): Promise<Result> {
		const queued: CrmEventInput[] = [];
		const result = await this.db.$transaction((tx) =>
			work(tx, async (input) => {
				await this.createEventTask(tx, input);
				queued.push(input);
			}),
		);

		for (const input of queued) {
			this.logger.log({
				message: "Agent event queued",
				type: input.type,
				recordKind: input.record.kind,
				recordId: input.record.id,
			});
		}
		if (queued.length > 0) this.poke();

		return result;
	}

	async fieldBackfillRecords(
		entity: FieldEntity,
		keys: string[],
		ids: string[],
		reason: string,
	): Promise<{ queued: number; merged: number }> {
		if (ids.length === 0 || keys.length === 0) {
			return { queued: 0, merged: 0 };
		}

		if (!(await this.allows("field-backfill"))) return { queued: 0, merged: 0 };

		const column = RECORD_ID_COLUMNS[entity];
		const records = ids.filter((id) => !isSampleRecordId(id));
		let queued = 0;
		let merged = 0;

		const queueOne = async (id: string): Promise<void> => {
			try {
				const outcome = await this.db.$transaction(async (tx) => {
					await lockIdempotencyKey(
						tx,
						`agent-task:field-backfill:${entity}:${id}`,
					);

					const pending = await tx.agentTask.findFirst({
						where: {
							kind: "field-backfill",
							finishedAt: null,
							[column]: id,
						} as Prisma.AgentTaskWhereInput,
						select: { id: true, payload: true },
					});

					if (!pending) {
						await tx.agentTask.create({
							data: {
								[column]: id,
								kind: "field-backfill",
								reason,
								priority: PRIORITY.fieldBackfill,
								budget: 8,
								dueAt: new Date(),
								payload: { entity, keys } satisfies Prisma.InputJsonValue,
							},
						});
						return "queued" as const;
					}

					const parsed = fieldBackfillPayload.safeParse(pending.payload);
					const priorKeys = parsed.success ? parsed.data.keys : [];
					const nextKeys = [...new Set([...priorKeys, ...keys])];
					if (nextKeys.length === priorKeys.length) return "unchanged" as const;

					await tx.agentTask.update({
						where: { id: pending.id },
						data: {
							payload: {
								entity,
								keys: nextKeys,
							} satisfies Prisma.InputJsonValue,
						},
					});
					return "merged" as const;
				});

				if (outcome === "queued") queued += 1;
				if (outcome === "merged") merged += 1;
			} catch (error) {
				this.logger.error(
					{
						message: "Could not queue agent task",
						kind: "field-backfill",
						entity,
						keys,
						recordId: id,
					},
					error instanceof Error ? error.stack : String(error),
				);
			}
		};

		await runWithConcurrency(
			records,
			AGENT_DISPATCH.fieldBackfill.concurrency,
			queueOne,
		);

		this.logger.log({
			message: "Agent task queued",
			kind: "field-backfill",
			entity,
			keys,
			queued,
			merged,
		});

		if (queued > 0 || merged > 0) this.poke();

		return { queued, merged };
	}

	async meetingSoon(contactId: string, when: Date): Promise<void> {
		await this.enqueue({
			contactId,
			kind: "meeting-prep",
			reason: `Meeting on ${when.toDateString()} with someone we know nothing about`,
			priority: PRIORITY.meeting,
			budget: 10,
		});
	}

	builderConversationQueued(): void {
		this.pokeRoute("/internal/crm/builder-dispatch");
	}

	deployedAgentRunQueued(): void {
		this.pokeRoute("/internal/crm/agent-dispatch");
	}

	deployedAgentRunCancelled(runId: string): void {
		void this.deliverCancellation(runId);
	}

	async redeliverCancellations(): Promise<void> {
		await forEachTenant(() => this.redeliverCancellationsHere());
	}

	private async redeliverCancellationsHere(): Promise<void> {
		try {
			const since = new Date(
				Date.now() - AGENT_DISPATCH.cancel.redeliverWithinMs,
			);
			const runs = await this.db.agentRun.findMany({
				where: {
					status: "CANCELLED",
					errorCode: AGENT_DISPATCH.cancel.errorCode,
					startedAt: { not: null },
					finishedAt: { gte: since },
				},
				orderBy: { finishedAt: "desc" },
				take: AGENT_DISPATCH.cancel.redeliverBatch,
				select: { id: true },
			});

			const outstanding = new Set(runs.map((run) => tenantScopedKey(run.id)));
			for (const key of this.cancellationsDelivered) {
				if (!outstanding.has(key)) this.cancellationsDelivered.delete(key);
			}

			for (const run of runs) {
				if (this.cancellationsDelivered.has(tenantScopedKey(run.id))) continue;
				await this.deliverCancellation(run.id);
			}
		} catch (error) {
			this.logger.error(
				{ message: "Could not redeliver run cancellations" },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private async deliverCancellation(runId: string): Promise<void> {
		const delivered = await this.post("/internal/crm/cancel-run", { runId });
		if (delivered) this.cancellationsDelivered.add(tenantScopedKey(runId));
	}

	async backfill(input: {
		kind: string;
		reason: string;
		contactIds?: string[];
		companyIds?: string[];
		budget?: number;
		priority?: number;
	}): Promise<{ queued: number; alreadyQueued: number }> {
		const subject = input.contactIds ? "contactId" : "companyId";
		const ids = [...new Set(input.contactIds ?? input.companyIds ?? [])].filter(
			(id) => !isSampleRecordId(id),
		);
		if (ids.length === 0) return { queued: 0, alreadyQueued: 0 };
		if (!(await this.allows(input.kind))) {
			return { queued: 0, alreadyQueued: 0 };
		}

		try {
			const outstanding = await this.db.agentTask.findMany({
				where: {
					kind: input.kind,
					finishedAt: null,
					[subject]: { in: ids },
				},
				select: { companyId: true, contactId: true },
			});

			const taken = new Set(
				outstanding.map((row) =>
					subject === "contactId" ? row.contactId : row.companyId,
				),
			);
			const fresh = ids.filter((id) => !taken.has(id));

			if (fresh.length > 0) {
				await this.db.agentTask.createMany({
					data: fresh.map((id) => ({
						contactId: input.contactIds ? id : null,
						companyId: input.companyIds ? id : null,
						kind: input.kind,
						reason: input.reason,
						priority: input.priority ?? PRIORITY.sweep,
						budget: input.budget ?? 4,
						dueAt: new Date(),
					})),
				});
			}

			this.logger.log({
				message: "Backfill queued",
				kind: input.kind,
				queued: fresh.length,
				alreadyQueued: ids.length - fresh.length,
			});

			if (fresh.length > 0) this.poke();

			return {
				queued: fresh.length,
				alreadyQueued: ids.length - fresh.length,
			};
		} catch (error) {
			this.logger.error(
				{ message: "Could not queue backfill", kind: input.kind },
				error instanceof Error ? error.stack : String(error),
			);
			throw error;
		}
	}

	private async allows(kind: string): Promise<boolean> {
		const functions = await readAgentFunctions(this.db);

		if (!isTaskKindEnabled(functions, kind)) {
			this.logger.log({
				message: "Task skipped: the operator switched this function off",
				kind,
			});
			return false;
		}

		return this.planAllows(kind);
	}

	private async planAllows(kind: string): Promise<boolean> {
		const limits = limitsOf(await planIdOf(this.db));

		if (!allowsCompanyResearch(kind, limits)) {
			this.logger.log({
				message: "Task skipped by the plan",
				kind,
				plan: limits.label,
			});
			return false;
		}

		const budget = monthlyBudget(kind, limits);
		if (budget === null) return true;

		const used = await this.db.agentTask.count({
			where: { kind, createdAt: { gte: startOfMonth() } },
		});

		if (used < budget) return true;

		this.logger.log({
			message: "Monthly budget for this task kind is spent",
			kind,
			plan: limits.label,
			used,
			allowed: budget,
		});

		return false;
	}

	private async enqueue(
		task: {
			contactId?: string;
			companyId?: string;
			kind: string;
			reason: string;
			priority: number;
			budget: number;
			payload?: Prisma.InputJsonValue;
			subject?: { path: string[]; value: string };
		},
		required = false,
		client?: Prisma.TransactionClient,
	): Promise<boolean> {
		if (isSampleRecordId(task.contactId) || isSampleRecordId(task.companyId)) {
			return false;
		}

		if (!(await this.allows(task.kind))) return false;

		try {
			const write = async (tx: Prisma.TransactionClient) => {
				await lockIdempotencyKey(
					tx,
					`agent-task:${task.kind}:${task.contactId ?? ""}:${task.companyId ?? ""}:${task.subject?.value ?? ""}`,
				);
				const pending = await tx.agentTask.findFirst({
					where: {
						kind: task.kind,
						finishedAt: null,
						contactId: task.contactId ?? undefined,
						companyId: task.companyId ?? undefined,
						payload: task.subject
							? { path: task.subject.path, equals: task.subject.value }
							: undefined,
					},
					select: { id: true },
				});
				if (pending) return false;

				await tx.agentTask.create({
					data: {
						contactId: task.contactId ?? null,
						companyId: task.companyId ?? null,
						kind: task.kind,
						reason: task.reason,
						priority: task.priority,
						budget: task.budget,
						dueAt: new Date(),
						payload: task.payload ?? undefined,
					},
				});
				return true;
			};

			const created = client
				? await write(client)
				: await this.db.$transaction(write);
			if (!created) return false;

			this.logger.log({
				message: "Agent task queued",
				kind: task.kind,
				contactId: task.contactId,
				companyId: task.companyId,
			});

			if (!client) this.poke();

			return true;
		} catch (error) {
			this.logger.error(
				{ message: "Could not queue agent task", kind: task.kind },
				error instanceof Error ? error.stack : String(error),
			);
			if (required) throw error;
			return false;
		}
	}

	private async createEventTask(
		tx: Prisma.TransactionClient,
		input: CrmEventInput,
	): Promise<void> {
		if (isSampleRecordId(input.record.id)) return;

		const recordIds = {
			contactId: input.record.kind === "contact" ? input.record.id : null,
			companyId: input.record.kind === "company" ? input.record.id : null,
			dealId: input.record.kind === "deal" ? input.record.id : null,
		};
		await tx.agentTask.create({
			data: {
				...recordIds,
				kind: "agent-event",
				reason: input.type,
				payload: {
					type: input.type,
					record: input.record,
					occurredAt: input.occurredAt.toISOString(),
					data: input.data,
				},
				priority: PRIORITY.event,
				budget: 1,
				dueAt: new Date(),
			},
		});
	}

	canReachAgent(): boolean {
		return bridge() !== null;
	}

	drainQueues(): void {
		this.poke();
		this.deployedAgentRunQueued();
		this.builderConversationQueued();
		void this.redeliverCancellations();
	}

	private poke(): void {
		this.pokeRoute("/internal/crm/dispatch");
	}

	private pokeRoute(path: string): void {
		void this.post(path);
	}

	private async post(
		path: string,
		body?: Record<string, string>,
	): Promise<boolean> {
		const agent = bridge();
		if (!agent) return false;

		try {
			const headers = new Headers({
				authorization: `Bearer ${agent.secret}`,
			});
			if (body) headers.set("content-type", "application/json");
			const tenantId = tenantOfThisRequest();
			if (tenantId) headers.set(TENANT_HEADER, tenantId);

			const response = await fetch(agent.url(path), {
				method: "POST",
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(AGENT_DISPATCH.poke.timeoutMs),
			});

			if (!response.ok) {
				throw new Error(`Agent poke returned ${response.status}.`);
			}

			return true;
		} catch (error) {
			this.logger.debug({
				message: "Agent poke did not land; the cron will pick this up",
				reason: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}
}
