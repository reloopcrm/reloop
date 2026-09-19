import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import { MEMORY } from "@crm/db/insights";
import { SAMPLE_ID_PATTERN } from "@crm/db/sample-data";
import { streamText } from "ai";
import { z } from "zod";
import { readDealHistory } from "./accounts";
import { DISPATCH } from "./dispatch-config";
import { language } from "./language";
import { directModel } from "./model";
import { scheduleTask } from "./tasks";
import { UNTRUSTED_RULE } from "./untrusted";

export const DEAL_STALL_KIND = "deal-stall";

const STALL = DISPATCH.dealStall;

let lastSweptAt: Date | null = null;

export function quietCutoff(now: Date): Date {
	return new Date(now.getTime() - STALL.quietDays * STALL.dayMs);
}

export const dealStep = z.object({
	subject: z.string().trim().min(1).max(STALL.subjectMaxChars),
	body: z.string().trim().min(1).max(STALL.bodyMaxChars),
});

export type DealStep = z.infer<typeof dealStep>;

export function stallSweepDue(lastQueuedAt: Date | null, now: Date): boolean {
	return (
		lastQueuedAt === null ||
		now.getTime() - lastQueuedAt.getTime() >= STALL.everyMs
	);
}

export function withoutDashes(text: string): string {
	return text
		.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
		.replace(/\s*[–—]\s*/g, ", ");
}

export function readDealStep(
	text: string,
): { ok: true; step: DealStep } | { ok: false; reason: string } {
	const cleaned = text.replace(/```(?:json)?/gi, "").trim();
	let value: unknown;
	try {
		value = JSON.parse(
			cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
		);
	} catch (error) {
		return {
			ok: false,
			reason:
				`not valid JSON (${error instanceof Error ? error.message : String(error)})`.slice(
					0,
					200,
				),
		};
	}

	const parsed = dealStep.safeParse(value);
	if (!parsed.success) {
		return {
			ok: false,
			reason: parsed.error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; ")
				.slice(0, 400),
		};
	}

	return {
		ok: true,
		step: {
			subject: withoutDashes(parsed.data.subject),
			body: withoutDashes(parsed.data.body),
		},
	};
}

export async function queueStalledDeals(now = new Date()): Promise<number> {
	if (!stallSweepDue(lastSweptAt, now)) return 0;

	const last = await db.agentTask.findFirst({
		where: { kind: DEAL_STALL_KIND },
		orderBy: { createdAt: "desc" },
		select: { createdAt: true },
	});
	if (!stallSweepDue(last?.createdAt ?? null, now)) {
		lastSweptAt = last?.createdAt ?? null;
		return 0;
	}

	const cutoff = quietCutoff(now);
	const stages: string[] = [...OPEN_DEAL_STAGES];

	const deals = await db.$queryRaw<{ id: string }[]>`
		WITH open_deal AS (
			SELECT d.id,
				GREATEST(
					COALESCE(d."lastActivityAt", d."createdAt"),
					(
						SELECT MAX(c."lastActivityAt")
						FROM "dealContact" AS dc
						JOIN "contact" AS c ON c.id = dc."contactId"
						WHERE dc."dealId" = d.id
					)
				) AS since
			FROM "deal" AS d
			WHERE d."archivedAt" IS NULL
				AND d.stage::text = ANY(${stages}::text[])
				AND d.id NOT LIKE ${SAMPLE_ID_PATTERN}
		)
		SELECT o.id FROM open_deal AS o
		WHERE o.since <= ${cutoff}
			AND NOT EXISTS (
				SELECT 1 FROM "agentTask" AS t
				WHERE t."dealId" = o.id
					AND t.kind = ${DEAL_STALL_KIND}
					AND t."createdAt" >= o.since
			)
		ORDER BY o.since DESC
		LIMIT ${STALL.batch}
	`;
	lastSweptAt = now;

	let queued = 0;
	for (const deal of deals) {
		const task = await scheduleTask({
			dealId: deal.id,
			kind: DEAL_STALL_KIND,
			reason: "Write the next step on a deal that has gone quiet",
			dueAt: now,
			priority: PRIORITY.dealStall,
			budget: 1,
		});
		if (task) queued += 1;
	}

	return queued;
}

export async function runDealStall(
	dealId: string,
	now = new Date(),
): Promise<string> {
	const deal = await db.deal.findUnique({
		where: { id: dealId },
		select: {
			stage: true,
			archivedAt: true,
			companyId: true,
			ownerId: true,
			lastActivityAt: true,
			createdAt: true,
		},
	});

	const open = (OPEN_DEAL_STAGES as readonly string[]).includes(
		deal?.stage ?? "",
	);
	if (!deal || deal.archivedAt || !open) {
		return "The deal is closed or gone. No note was written.";
	}
	if ((deal.lastActivityAt ?? deal.createdAt) > quietCutoff(now)) {
		return "The deal moved after it was queued. No note was written.";
	}

	const history = await readDealHistory(dealId, {
		threads: STALL.threads,
		messagesPerThread: STALL.messagesPerThread,
	});
	if (!history) return "The deal is gone. No note was written.";
	if (history.threads.length === 0 && history.notes.length === 0) {
		return "There is no mail and no note to read. No note was written.";
	}

	const model = await directModel("reading", DEAL_STALL_KIND);

	const system = [
		"You help a sales rep with an open deal that has gone quiet.",
		"Read the deal, its stage clock, its notes and the latest emails with the people on it, then name the one next step that would move this deal forward.",
		"The step is concrete: who to contact, about what, and why now, taken from what the emails actually say. Say what the last exchange was and who owes the next move. Never invent a fact, a price or a promise that is not in the material.",
		UNTRUSTED_RULE,
		`Write in ${language()}. Never use a dash as punctuation; use a comma, a colon or a full stop instead.`,
		`The subject is at most ${STALL.subjectMaxChars} characters. The body is at most ${STALL.bodyMaxChars} characters, plain text, no headings.`,
		"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
		JSON.stringify(z.toJSONSchema(dealStep)),
	].join("\n");

	const prompt = `Deal history:\n${JSON.stringify(history)}`;

	let lastError = "";
	for (let attempt = 0; attempt < MEMORY.jsonAttempts; attempt += 1) {
		const result = streamText({
			model,
			abortSignal: AbortSignal.timeout(MEMORY.callTimeoutMs),
			system: lastError
				? `${system}\n\nPrevious answer rejected: ${lastError}`
				: system,
			prompt,
		});
		let text = "";
		for await (const part of result.textStream) text += part;

		const read = readDealStep(text);
		if (!read.ok) {
			lastError = read.reason;
			continue;
		}

		await db.activity.create({
			data: {
				type: "NOTE",
				subject: read.step.subject,
				body: read.step.body,
				occurredAt: now,
				dealId,
				companyId: deal.companyId,
				createdById: deal.ownerId,
				meta: { agent: DEAL_STALL_KIND },
			},
			select: { id: true },
		});

		return `Wrote the next step: ${read.step.subject}`;
	}

	throw new Error(`The model did not return a usable next step: ${lastError}`);
}
