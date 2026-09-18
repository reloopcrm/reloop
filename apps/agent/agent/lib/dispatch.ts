import { EnrichmentStatus } from "@crm/db";
import { AGENT_FUNCTION_OFF_OUTCOME } from "@crm/validation/agent-functions";
import {
	readAgentTaskInstruction,
	readAgentTaskThreadId,
} from "@crm/validation/agent-task-payload";
import { fieldBackfillPayload } from "@crm/validation/field-backfill";
import { APP_AUTH, type AppAuth } from "./app-auth";
import { brandOutcome, runBrand } from "./brand";
import { runBusinessSetup } from "./business-setup";
import { runContactClean } from "./contact-clean";
import {
	archiveOwnContacts,
	pruneCompanies,
	pruneContacts,
} from "./contact-prune";
import { sweepContactStanding } from "./contact-standing-sweep";
import { queueEventAgentRuns } from "./custom-agent-dispatch";
import { settledWithin } from "./deadline";
import { DISPATCH } from "./dispatch-config";
import { runEmailDraft } from "./email-draft";
import { markRunning, settle } from "./enrichment";
import {
	cancelArchivedWork,
	queueContactCleanups,
	queuePlaybookLearn,
	queueUnreadThreads,
} from "./housekeeping";
import { runThreadDigest, runThreadInsight } from "./insight";
import {
	isExhaustion,
	modelUnavailable,
	probeUsage,
	providersExhausted,
	readProviderFailure,
	resumeAt,
} from "./model";
import { runPlaybookLearn } from "./playbook";
import { collapsing, runLimited } from "./pool";
import { runPortrait } from "./portrait";
import { researchAllowance } from "./research-throttle";
import { runRulesTune } from "./rules-tuner";
import { runSlackChannelJoin } from "./slack-join-task";
import { runSlackPeopleMatch } from "./slack-people";
import { staleTaskSweep } from "./stale-tasks";
import {
	claimDue,
	completeTask,
	DIRECT_KINDS,
	type LeasedTask,
	noteSession,
	postponeTask,
	taskKindEnabled,
} from "./tasks";

export const VISIBLE_BATCH = DISPATCH.visible.batch;
export const VISIBLE_CONCURRENCY = DISPATCH.visible.concurrency;
export const VISIBLE_LEASE_MS = DISPATCH.visible.leaseMs;

export const RESEARCH_BATCH = DISPATCH.research.batch;
export const RESEARCH_LEASE_MS = DISPATCH.research.leaseMs;

const INSIGHT_KIND = "thread-insight";
const MODEL_KINDS = new Set([
	INSIGHT_KIND,
	"thread-digest",
	"contact-clean",
	"playbook-learn",
	"email-draft",
	"business-setup",
]);
const VISIBLE_KINDS = DIRECT_KINDS.filter((kind) => !MODEL_KINDS.has(kind));

export async function runVisibleLane(signal?: AbortSignal): Promise<number> {
	let handled = 0;

	while (handled < VISIBLE_BATCH) {
		if (signal?.aborted) break;

		const tasks = await claimDue(
			Math.min(VISIBLE_CONCURRENCY, VISIBLE_BATCH - handled),
			{ only: VISIBLE_KINDS },
			VISIBLE_LEASE_MS,
		);

		if (tasks.length === 0) break;

		await runLimited(VISIBLE_CONCURRENCY, tasks, runDirect, signal);
		handled += tasks.length;
	}

	return handled;
}

export async function runInsightLane(signal?: AbortSignal): Promise<number> {
	let handled = 0;

	while (handled < DISPATCH.insight.batch) {
		if (signal?.aborted) break;

		if (await providersExhausted()) {
			const until = await resumeAt();
			console.error(
				`[agent] reading paused until ${until?.toISOString() ?? "the limit resets"}: ${
					(await modelUnavailable()) ??
					"every configured model provider is at its usage limit"
				}`,
			);
			break;
		}

		const tasks = await claimDue(
			Math.min(DISPATCH.insight.concurrency, DISPATCH.insight.batch - handled),
			{ only: [...MODEL_KINDS] },
			DISPATCH.insight.leaseMs,
		);

		if (tasks.length === 0) break;

		await runLimited(DISPATCH.insight.concurrency, tasks, runDirect, signal);
		handled += tasks.length;
	}

	return handled;
}

type DirectOutcome = { finished: true } | { finished: false; reason: string };

export async function runDirect(
	task: LeasedTask,
	handle: (task: LeasedTask) => Promise<void> = handleDirect,
	timeoutMs: number = DISPATCH.sweep.itemTimeoutMs,
): Promise<void> {
	const work: Promise<DirectOutcome> = handle(task).then(
		() => ({ finished: true }) as const,
		(error) => ({ finished: false, reason: reasonOf(error) }) as const,
	);

	const outcome = await settledWithin(work, timeoutMs);

	if (outcome.settled) {
		await reconcileDirect(task, outcome.value);
		return;
	}

	pendingItems += 1;
	void work
		.then((late) => reconcileDirect(task, late))
		.finally(() => {
			pendingItems -= 1;
		});
}

async function reconcileDirect(
	task: LeasedTask,
	outcome: DirectOutcome,
): Promise<void> {
	if (outcome.finished) return;

	console.error(`[agent] ⨯ ${task.kind} ${task.id}: ${outcome.reason}`);
	await settle(task, EnrichmentStatus.FAILED, outcome.reason).catch(() => {});
}

async function handleDirect(task: LeasedTask): Promise<void> {
	if (!(await taskKindEnabled(task.kind))) {
		await completeTask(task.id, AGENT_FUNCTION_OFF_OUTCOME);
		return;
	}

	if (task.kind === "brand" && task.companyId) {
		const result = await runBrand({ companyId: task.companyId });
		if (result.retryable) return;

		await completeTask(task.id, brandOutcome(result));
		return;
	}

	if (task.kind === "portrait" && task.contactId) {
		const portrait = await runPortrait({ contactId: task.contactId });

		await completeTask(
			task.id,
			portrait.stored
				? `Picture stored from ${portrait.source}.`
				: (portrait.reason ?? "No picture found."),
		);
		return;
	}

	if (task.kind === "thread-insight") {
		const threadId = readAgentTaskThreadId(task.payload);
		if (!threadId) {
			await completeTask(task.id, "No thread id on the task.");
			return;
		}

		try {
			await completeTask(task.id, await runThreadInsight(threadId));
		} catch (error) {
			const until = await resumeAt();
			if (!until || !isExhaustion(readProviderFailure(error))) throw error;

			await postponeTask(task.id, until);
			console.error(
				`[agent] reading postponed until ${until.toISOString()}: the usage limit is reached`,
			);
		}
		return;
	}

	if (task.kind === "thread-digest") {
		const threadId = readAgentTaskThreadId(task.payload);
		if (!threadId) {
			await completeTask(task.id, "No thread id on the task.");
			return;
		}

		try {
			await completeTask(task.id, await runThreadDigest(threadId));
		} catch (error) {
			const until = await resumeAt();
			if (!until || !isExhaustion(readProviderFailure(error))) throw error;

			await postponeTask(task.id, until);
			console.error(
				`[agent] a digest waits until ${until.toISOString()}: the usage limit is reached`,
			);
		}
		return;
	}

	if (task.kind === "email-draft" && task.contactId) {
		try {
			await completeTask(
				task.id,
				await runEmailDraft(
					task.contactId,
					readAgentTaskInstruction(task.payload),
				),
			);
		} catch (error) {
			const until = await resumeAt();
			if (!until || !isExhaustion(readProviderFailure(error))) throw error;

			await postponeTask(task.id, until);
			console.error(
				`[agent] a draft waits until ${until.toISOString()}: the usage limit is reached`,
			);
		}
		return;
	}

	if (task.kind === "contact-clean" && task.contactId) {
		await completeTask(task.id, await runContactClean(task.contactId));
		return;
	}

	if (task.kind === "playbook-learn") {
		await completeTask(task.id, await runPlaybookLearn());
		return;
	}

	if (task.kind === "usage-probe") {
		await completeTask(task.id, await probeUsage());
		return;
	}

	if (task.kind === "business-setup") {
		await completeTask(task.id, await runBusinessSetup());
		return;
	}

	if (task.kind === "rules-tune") {
		await completeTask(task.id, await runRulesTune());
		return;
	}

	if (task.kind === "slack-people-match") {
		await completeTask(task.id, await runSlackPeopleMatch());
		return;
	}

	if (task.kind === "slack-channel-join") {
		await completeTask(task.id, await runSlackChannelJoin(task.payload));
		return;
	}

	if (task.kind === "agent-event") {
		const queued = await queueEventAgentRuns(task);
		await completeTask(
			task.id,
			queued === 1
				? "Queued 1 matching agent run."
				: `Queued ${queued} matching agent runs.`,
		);
		return;
	}

	await completeTask(task.id, "The record this names is gone.");
}

export async function runResearchLane(
	start: (task: LeasedTask) => Promise<{ id: string }>,
	signal?: AbortSignal,
): Promise<number> {
	if (signal?.aborted) return 0;

	const allowance = await researchAllowance(RESEARCH_BATCH);
	if (allowance.allowed === 0) {
		if (allowance.reason) {
			console.error(`[agent] research paused: ${allowance.reason}`);
		}
		return 0;
	}

	const tasks = await claimDue(
		allowance.allowed,
		{ except: DIRECT_KINDS },
		RESEARCH_LEASE_MS,
	);
	if (tasks.length === 0) return 0;

	const blocked = await modelUnavailable();
	if (blocked) {
		const until = await resumeAt();
		for (const task of tasks) {
			await postponeTask(
				task.id,
				until ?? new Date(Date.now() + DISPATCH.blocked.retryMs),
			);
		}
		console.error(`[agent] ${tasks.length} tasks wait: ${blocked}`);
		return 0;
	}

	let started = 0;

	await Promise.all(
		tasks.map(async (task) => {
			if (signal?.aborted) return;
			started += 1;
			await beginResearch(task, start);
		}),
	);

	return started;
}

type StartOutcome =
	| { accepted: true; sessionId: string }
	| { accepted: false; reason: string };

async function beginResearch(
	task: LeasedTask,
	start: (task: LeasedTask) => Promise<{ id: string }>,
): Promise<void> {
	if (!(await taskKindEnabled(task.kind))) {
		await completeTask(task.id, AGENT_FUNCTION_OFF_OUTCOME);
		return;
	}

	try {
		await markRunning(task);
	} catch (error) {
		await settle(task, EnrichmentStatus.FAILED, reasonOf(error)).catch(
			() => {},
		);
		return;
	}

	const send: Promise<StartOutcome> = start(task).then(
		(session) => ({ accepted: true, sessionId: session.id }) as const,
		(error) => ({ accepted: false, reason: reasonOf(error) }) as const,
	);

	const outcome = await settledWithin(send, DISPATCH.sweep.startTimeoutMs);

	if (outcome.settled) {
		await reconcileStart(task, outcome.value);
		return;
	}

	pendingStarts += 1;
	void send
		.then((late) => reconcileStart(task, late))
		.finally(() => {
			pendingStarts -= 1;
		});
}

async function reconcileStart(
	task: LeasedTask,
	outcome: StartOutcome,
): Promise<void> {
	if (outcome.accepted) {
		await linkSession(task, outcome.sessionId);
		return;
	}

	await settle(task, EnrichmentStatus.FAILED, outcome.reason).catch(() => {});
}

export async function linkSession(
	task: LeasedTask,
	sessionId: string,
	note: (taskId: string, sessionId: string) => Promise<void> = noteSession,
	link: { attempts: number; retryMs: number } = DISPATCH.research.link,
): Promise<boolean> {
	for (let attempt = 1; attempt <= link.attempts; attempt += 1) {
		try {
			await note(task.id, sessionId);
			return true;
		} catch (error) {
			if (attempt < link.attempts) {
				await new Promise((resolve) =>
					setTimeout(resolve, link.retryMs * attempt),
				);
				continue;
			}

			unlinkedSessions += 1;
			console.error(
				`[agent] Task ${task.id} accepted session ${sessionId}, but the session id was not recorded: ${reasonOf(error)}`,
			);
		}
	}

	return false;
}

function reasonOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

export function taskAuth(task: LeasedTask, base: AppAuth = APP_AUTH): AppAuth {
	const records: Record<string, string> = {};
	if (task.contactId) records.contactId = task.contactId;
	if (task.companyId) records.companyId = task.companyId;
	if (task.dealId) records.dealId = task.dealId;

	if (task.kind === "field-backfill") {
		const parsed = fieldBackfillPayload.safeParse(task.payload);
		if (parsed.success) records.fieldKeys = parsed.data.keys.join(",");
	}

	return {
		...base,
		attributes: {
			taskKind: task.kind,
			reason: task.reason,
			budget: String(task.budget),
			...records,
		},
	};
}

export const DRAIN_TIMEOUT_MS = DISPATCH.sweep.timeoutMs;

let lastSweepStartedAt: Date | null = null;
let lastSweepFinishedAt: Date | null = null;
let lastSweepError: string | null = null;
let abandonedSweeps = 0;
let pendingStarts = 0;
let pendingItems = 0;
let unlinkedSessions = 0;

const unsettledSweeps = new Set<{ startedAt: Date }>();

function oldestUnsettledAt(): Date | null {
	let oldest: Date | null = null;

	for (const sweep of unsettledSweeps) {
		if (!oldest || sweep.startedAt.getTime() < oldest.getTime()) {
			oldest = sweep.startedAt;
		}
	}

	return oldest;
}

export function dispatchHealth() {
	const startedAt = lastSweepStartedAt;
	const finishedAt = lastSweepFinishedAt;
	const collapsed = Boolean(
		startedAt && (!finishedAt || finishedAt.getTime() < startedAt.getTime()),
	);
	const unsettledAt = oldestUnsettledAt();
	const running = collapsed || unsettledAt !== null;

	const since = collapsed && startedAt ? startedAt : unsettledAt;
	const oldest =
		since && unsettledAt && unsettledAt.getTime() < since.getTime()
			? unsettledAt
			: since;

	return {
		startedAt: startedAt?.toISOString() ?? null,
		finishedAt: finishedAt?.toISOString() ?? null,
		running,
		stalledMs: oldest ? Math.max(0, Date.now() - oldest.getTime()) : 0,
		abandonedSweeps,
		unsettledSweeps: unsettledSweeps.size,
		pendingStarts,
		pendingItems,
		unlinkedSessions,
		staleTasks: staleTaskSweep(),
		lastError: lastSweepError,
	};
}

async function runSweep(
	label: string,
	run: () => Promise<unknown>,
): Promise<void> {
	try {
		await run();
	} catch (cause) {
		console.error(`[agent] ${label}: ${reasonOf(cause)}`);
	}
}

export const drainAll = collapsing(
	async (start: (task: LeasedTask) => Promise<{ id: string }>) => {
		if (unsettledSweeps.size >= DISPATCH.sweep.maxAbandoned) {
			lastSweepError =
				"An abandoned dispatch sweep is still in flight, so this sweep did not start.";
			console.error(`[agent] ${lastSweepError}`);
			return;
		}

		const startedAt = new Date();
		lastSweepStartedAt = startedAt;
		lastSweepError = null;

		const controller = new AbortController();
		const signal = controller.signal;

		const sweep = (async () => {
			await Promise.all([
				runSweep("contact cleanup sweep failed", queueContactCleanups),
				runSweep("playbook sweep failed", queuePlaybookLearn),
				runSweep("own-contact sweep failed", archiveOwnContacts),
				runSweep("contact prune failed", async () => {
					await pruneContacts();
					await pruneCompanies();
				}),
				runSweep("contact standing sweep failed", sweepContactStanding),
				runSweep("reading sweep failed", queueUnreadThreads),
				runSweep("archived-work sweep failed", cancelArchivedWork),
			]);
			await Promise.all([
				runVisibleLane(signal),
				runInsightLane(signal),
				runResearchLane(start, signal),
			]);
		})();

		let timer: ReturnType<typeof setTimeout> | undefined;
		const abandon = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				abandonedSweeps += 1;

				const unsettled = { startedAt };
				unsettledSweeps.add(unsettled);

				const forget = setTimeout(() => {
					if (!unsettledSweeps.delete(unsettled)) return;
					console.error(
						`[agent] An abandoned dispatch sweep never settled within ${DISPATCH.sweep.abandonGraceMs}ms, so dispatch is starting again without it.`,
					);
				}, DISPATCH.sweep.abandonGraceMs);
				forget.unref?.();

				void sweep
					.catch((error) => {
						console.error(
							`[agent] An abandoned dispatch sweep then failed: ${reasonOf(error)}`,
						);
					})
					.finally(() => {
						clearTimeout(forget);
						unsettledSweeps.delete(unsettled);
					});

				controller.abort();
				reject(
					new Error(
						`Dispatch sweep exceeded ${DRAIN_TIMEOUT_MS}ms and was abandoned so the next one can start.`,
					),
				);
			}, DRAIN_TIMEOUT_MS);
		});

		sweep.catch(() => {});

		try {
			await Promise.race([sweep, abandon]);
		} catch (error) {
			lastSweepError = reasonOf(error);
			console.error(`[agent] ${lastSweepError}`);
			throw error;
		} finally {
			clearTimeout(timer);
			lastSweepFinishedAt = new Date();
		}
	},
);

export function brief(task: LeasedTask): string {
	const again =
		task.attempts > 1
			? `This is attempt ${task.attempts}; the earlier one did not finish. Carry on from what is already in this thread rather than starting again. `
			: "";

	return again + work(task.kind, task.reason, task.payload);
}

function work(
	kind: string,
	reason: string,
	payload: LeasedTask["payload"],
): string {
	switch (kind) {
		case "identify":
			return "Work out who this contact actually is, and record what you find. Read what we already have before spending anything.";
		case "profile":
		case "recheck":
			return "Bring this contact's record up to date: their background, their current role, and anything that has changed since we last looked.";
		case "meeting-prep":
			return "There is a meeting with this person soon. Make sure whoever is taking it opens the record knowing who they are dealing with.";
		case "company-profile":
			return "Fill this company's basics and stop. Call enrich_company once: that fills the name, the industry, the city, the links and a short description. Do not read the website yourself, do not research their pricing, their customers or their news, and do not write a brief. The rep only needs to know who they are and where they sit. If enrich_company fills nothing, say so and finish.";
		case "workspace-profile":
			return "Write the profile of the company you work for, so that every other session knows who we are. Read our own site and keep it short.";
		case "field-backfill": {
			const parsed = fieldBackfillPayload.safeParse(payload);
			const keys = parsed.success ? parsed.data.keys.join(", ") : reason;
			return `This record is missing a value for the custom field(s) ${keys}. Call list_fields for this record's type, read each field's brief, and call set_field_value only where you find real evidence — leave it blank rather than guess.`;
		}
		default:
			return `Handle this: ${reason}`;
	}
}
