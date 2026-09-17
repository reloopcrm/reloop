import { db } from "@crm/db";
import {
	INSIGHT_OUTCOMES,
	INSIGHT_SIDES,
	MEMORY,
	THREAD_CLASSIFICATION,
} from "@crm/db/insights";
import {
	readWinBackRules,
	type WinBackRules,
} from "@crm/validation/win-back-rules";
import { streamText } from "ai";
import { z } from "zod";
import { language, say } from "./language";
import { directModel } from "./model";
import { MODEL } from "./model-config";
import { playbookPrompt, readPlaybook } from "./playbook";
import { UNTRUSTED_RULE, untrusted } from "./untrusted";

function clamped(max: number) {
	return z.string().transform((text) => text.slice(0, max));
}

function capped<T extends z.ZodType>(item: T, max: number) {
	return z.array(item).transform((list) => list.slice(0, max));
}

const messageSummary = z.object({
	message: z
		.number()
		.int()
		.min(1)
		.describe("The number in front of the message in the transcript."),
	summary: z
		.string()
		.max(MEMORY.messageSummaryMaxChars)
		.describe(
			`What this one message says or asks, in ${language()}, no greeting.`,
		),
});

const threadDigestSchema = z.object({
	messageSummaries: z.array(messageSummary).max(MEMORY.messagesPerThread),
});

export const threadInsightSchema = z.object({
	relevant: z
		.boolean()
		.describe(
			"True only when the conversation is about the workspace's business.",
		),
	topics: z.array(z.string().max(60)).max(8),
	side: z.enum(INSIGHT_SIDES),
	products: z.array(z.string().max(60)).max(8),
	quantityPallets: z
		.number()
		.int()
		.min(0)
		.nullable()
		.describe("Largest quantity of the main products mentioned, as units."),
	loads: z
		.number()
		.int()
		.min(0)
		.nullable()
		.describe("Largest number of truck loads mentioned, if any."),
	outcome: z.enum(INSIGHT_OUTCOMES),
	unansweredByUs: z
		.boolean()
		.describe(
			"True when their last message asks for something and we never replied.",
		),
	summary: z.string().max(MEMORY.threadSummaryMaxChars),
	evidence: z
		.array(z.string().max(200))
		.max(4)
		.describe("Short quotes from the messages that support the verdict."),
	messageSummaries: z
		.array(messageSummary)
		.max(MEMORY.messagesPerThread)
		.describe(
			`One ${language()} line for every numbered message in the transcript, each at most 20 words.`,
		),
});

const lenientInsightSchema = threadInsightSchema.extend({
	topics: capped(clamped(60), 8),
	products: capped(clamped(60), 8),
	summary: clamped(MEMORY.threadSummaryMaxChars),
	evidence: capped(clamped(200), 4),
	messageSummaries: capped(
		z.object({
			message: z.number().int().min(1),
			summary: clamped(MEMORY.messageSummaryMaxChars),
		}),
		MEMORY.messagesPerThread,
	),
});

const lenientDigestSchema = threadDigestSchema.extend({
	messageSummaries: capped(
		z.object({
			message: z.number().int().min(1),
			summary: clamped(MEMORY.messageSummaryMaxChars),
		}),
		MEMORY.messagesPerThread,
	),
});

export type ThreadInsightVerdict = z.infer<typeof threadInsightSchema>;

const memorySchema = z.object({
	summary: z.string().max(MEMORY.summaryMaxChars),
});

const lenientMemorySchema = z.object({
	summary: clamped(MEMORY.summaryMaxChars),
});

type ThreadRecord = {
	id: string;
	subject: string | null;
	contactId: string | null;
	lastMessageAt: Date;
	messages: {
		id?: string;
		summary?: string | null;
		direction: string;
		fromEmail: string;
		fromName: string | null;
		sentAt: Date;
		body: string | null;
		snippet: string | null;
	}[];
};

function transcript(thread: ThreadRecord): string {
	const recent = thread.messages.slice(-MEMORY.messagesPerThread);

	return recent
		.map((message, index) => {
			const who =
				message.direction === "OUTBOUND"
					? "WE"
					: `THEY (${message.fromName ?? message.fromEmail})`;
			const body = (message.body ?? message.snippet ?? "").slice(
				0,
				MEMORY.bodyMaxChars,
			);
			return `${index + 1}. [${message.sentAt.toISOString().slice(0, 10)}] ${who}:\n${body}`;
		})
		.join("\n\n---\n\n");
}

async function businessPrompt(rules: WinBackRules): Promise<string> {
	return [
		rules.business.description
			? `The workspace's business: ${rules.business.description}`
			: "",
		rules.business.products.length
			? `Products that count: ${rules.business.products.join(", ")}.`
			: "",
		`A quantity from ${rules.business.minPallets} ${rules.business.unit} upwards is a big order.`,
		rules.business.boxProducts.length
			? `For ${rules.business.boxProducts.join(", ")} a big order starts at ${rules.business.minBoxes}, because one holds far more.`
			: "",
		playbookPrompt(await readPlaybook()),
	]
		.filter(Boolean)
		.join("\n");
}

function jsonBlock(text: string): string {
	const cleaned = text.replace(/```(?:json)?/gi, "").trim();
	const first = cleaned.indexOf("{");
	const last = cleaned.lastIndexOf("}");
	return first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
}

export async function askJson<T>(
	model: Awaited<ReturnType<typeof directModel>>,
	schema: z.ZodType<T>,
	system: string,
	prompt: string,
	shape: z.ZodType = schema,
): Promise<T> {
	let lastError = "";

	for (let attempt = 0; attempt < MEMORY.jsonAttempts; attempt += 1) {
		const result = streamText({
			model,
			abortSignal: AbortSignal.timeout(MEMORY.callTimeoutMs),
			instructions: [
				{
					role: "system",
					content: `${system}\n\nAnswer with one JSON object only, no prose, no code fences. The object must match this JSON schema:\n${JSON.stringify(z.toJSONSchema(shape))}`,
					providerOptions: MODEL.cache,
				},
				...(lastError
					? [
							{
								role: "system" as const,
								content: `Your previous answer was rejected: ${lastError}`,
							},
						]
					: []),
			],
			prompt,
		});

		let text = "";
		for await (const part of result.textStream) text += part;

		try {
			const parsed = schema.safeParse(JSON.parse(jsonBlock(text)));
			if (parsed.success) return parsed.data;
			lastError = parsed.error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; ")
				.slice(0, 400);
		} catch (error) {
			lastError =
				`not valid JSON (${error instanceof Error ? error.message : String(error)})`.slice(
					0,
					200,
				);
		}
	}

	throw new Error(`The model did not return a valid answer: ${lastError}`);
}

export async function classifyThread(
	thread: ThreadRecord,
	rules: WinBackRules,
): Promise<{ verdict: ThreadInsightVerdict; modelId: string }> {
	const model = await directModel("reading", "thread-insight");

	const object = await askJson(
		model,
		lenientInsightSchema,
		[
			"You read one email conversation from a company's mailbox and report facts about it.",
			UNTRUSTED_RULE,
			"Report only what the messages say. Never invent quantities, outcomes or intentions.",
			"Quantities: convert loads to units only when the messages state the conversion; otherwise leave units null and fill loads.",
			"DEAL_DONE means an order was confirmed, delivered or invoiced in this conversation.",
			"OPEN_INQUIRY_THEIRS means they asked to buy or sell and no agreement was reached.",
			"OPEN_OFFER_OURS means we offered and they did not answer.",
			`Write the summary in ${language()}, at most three sentences, naming what was discussed and where it ended.`,
			`messageSummaries holds one ${language()} line for every numbered message, with its number, each at most 20 words.`,
			"A message line never names its sender and never starts with WE or THEY. It starts with the verb.",
			`A message line leaves out the greeting, the sign-off and the signature. Write a range as ${say("'800 to 1000'", "'800 bis 1000'")}, never with a dash.`,
			await businessPrompt(rules),
		].join("\n"),
		untrusted(
			`Subject: ${thread.subject ?? "(no subject)"}\n\n${transcript(thread)}`,
		),
		threadInsightSchema,
	);

	return { verdict: object, modelId: model.modelId };
}

async function refreshMemory(
	contactId: string,
	rules: WinBackRules,
	added: { threadId: string; verdict: ThreadInsightVerdict },
): Promise<void> {
	const existing = await db.contactMemory.findUnique({ where: { contactId } });
	if (existing?.coveredThreadIds.includes(added.threadId)) return;

	const insights = await db.threadInsight.findMany({
		where: { thread: { contactId }, relevant: true },
		select: {
			threadId: true,
			outcome: true,
			unansweredByUs: true,
			quantityPallets: true,
			products: true,
			summary: true,
			lastMessageAt: true,
		},
		orderBy: { lastMessageAt: "desc" },
	});

	const didBusiness = insights.filter(
		(entry) => entry.outcome === "DEAL_DONE",
	).length;
	const openInquiries = insights.filter(
		(entry) =>
			entry.outcome === "OPEN_INQUIRY_THEIRS" ||
			entry.outcome === "OPEN_OFFER_OURS" ||
			entry.unansweredByUs,
	).length;
	const maxPallets = insights.reduce<number | null>(
		(max, entry) =>
			entry.quantityPallets !== null &&
			(max === null || entry.quantityPallets > max)
				? entry.quantityPallets
				: max,
		null,
	);
	const products = [...new Set(insights.flatMap((entry) => entry.products))];
	const lastOutcome = insights[0]?.outcome ?? null;

	let summary = existing?.summary ?? "";
	let modelId = existing?.modelId ?? null;

	if (added.verdict.relevant) {
		const model = await directModel("reading", "contact-memory");
		const object = await askJson(
			model,
			lenientMemorySchema,
			[
				"You maintain a short running memory about one business contact for a sales rep.",
				`Keep it under ${MEMORY.summaryMaxChars} characters, in ${language()}, facts only: what they buy or sell, quantities, prices if stated, what was agreed, what is still open, how the relationship ended.`,
				"Merge the new conversation into the existing memory. Drop nothing that still matters, repeat nothing.",
				UNTRUSTED_RULE,
				await businessPrompt(rules),
			].join("\n"),
			untrusted(
				`Existing memory:\n${summary || "(empty)"}\n\nNew conversation (${added.verdict.outcome}):\n${added.verdict.summary}`,
			),
			memorySchema,
		);
		summary = object.summary;
		modelId = model.modelId;
	}

	await db.contactMemory.upsert({
		where: { contactId },
		create: {
			contactId,
			summary,
			didBusiness,
			openInquiries,
			maxPallets,
			products,
			lastOutcome,
			coveredThreadIds: [...(existing?.coveredThreadIds ?? []), added.threadId],
			modelId,
		},
		update: {
			summary,
			didBusiness,
			openInquiries,
			maxPallets,
			products,
			lastOutcome,
			coveredThreadIds: [...(existing?.coveredThreadIds ?? []), added.threadId],
			modelId,
		},
	});
}

export async function runThreadInsight(threadId: string): Promise<string> {
	const thread = await db.emailThread.findUnique({
		where: { id: threadId },
		select: {
			id: true,
			subject: true,
			contactId: true,
			lastMessageAt: true,
			classification: true,
			insight: { select: { lastMessageAt: true } },
			messages: {
				orderBy: { sentAt: "asc" },
				select: {
					id: true,
					direction: true,
					fromEmail: true,
					fromName: true,
					sentAt: true,
					body: true,
					snippet: true,
				},
			},
		},
	});

	if (!thread) return "The thread is gone.";
	if (thread.messages.length === 0) return "The thread has no messages.";

	const rules = await readWinBackRules(db);
	const unchanged =
		thread.insight !== null &&
		thread.insight.lastMessageAt.getTime() === thread.lastMessageAt.getTime();

	let verdict: ThreadInsightVerdict;

	if (unchanged) {
		const stored = await db.threadInsight.findUniqueOrThrow({
			where: { threadId },
		});
		verdict = {
			relevant: stored.relevant,
			topics: stored.topics,
			side: (stored.side ?? "UNCLEAR") as ThreadInsightVerdict["side"],
			products: stored.products,
			quantityPallets: stored.quantityPallets,
			loads: stored.loads,
			outcome: stored.outcome as ThreadInsightVerdict["outcome"],
			unansweredByUs: stored.unansweredByUs,
			summary: stored.summary,
			evidence: stored.evidence,
			messageSummaries: [],
		};
	} else {
		const result = await classifyThread(thread, rules);
		verdict = result.verdict;

		await storeMessageSummaries(thread, verdict.messageSummaries);

		const { messageSummaries: _lines, ...row } = verdict;
		await db.threadInsight.upsert({
			where: { threadId },
			create: {
				threadId,
				...row,
				modelId: result.modelId,
				lastMessageAt: thread.lastMessageAt,
			},
			update: {
				...row,
				modelId: result.modelId,
				lastMessageAt: thread.lastMessageAt,
			},
		});

		if (thread.classification !== THREAD_CLASSIFICATION.none) {
			await db.emailThread.update({
				where: { id: threadId },
				data: {
					classification: verdict.relevant
						? THREAD_CLASSIFICATION.relevant
						: THREAD_CLASSIFICATION.irrelevant,
				},
			});
		}
	}

	if (thread.contactId) {
		await refreshMemory(thread.contactId, rules, { threadId, verdict });
	}

	if (!verdict.relevant) {
		return `Not about the business: ${verdict.summary.slice(0, 120)}`;
	}

	const units = verdict.quantityPallets
		? `, ${verdict.quantityPallets} units`
		: "";
	return `${verdict.outcome}${units}: ${verdict.summary.slice(0, 160)}`;
}

async function storeMessageSummaries(
	thread: ThreadRecord,
	lines: z.infer<typeof messageSummary>[],
): Promise<number> {
	const recent = thread.messages.slice(-MEMORY.messagesPerThread);
	let written = 0;

	for (const line of lines) {
		const message = recent[line.message - 1];
		const summary = line.summary.trim();
		if (!message?.id || summary.length === 0) continue;

		await db.emailMessage.update({
			where: { id: message.id },
			data: { summary },
		});
		written += 1;
	}

	return written;
}

export async function runThreadDigest(threadId: string): Promise<string> {
	const thread = await db.emailThread.findUnique({
		where: { id: threadId },
		select: {
			id: true,
			subject: true,
			contactId: true,
			lastMessageAt: true,
			messages: {
				orderBy: { sentAt: "asc" },
				select: {
					id: true,
					summary: true,
					direction: true,
					fromEmail: true,
					fromName: true,
					sentAt: true,
					body: true,
					snippet: true,
				},
			},
		},
	});

	if (!thread) return "The thread is gone.";

	const recent = thread.messages.slice(-MEMORY.messagesPerThread);
	if (recent.length === 0) return "The thread has no messages.";
	if (recent.every((message) => message.summary !== null)) {
		return "Every message already has a line.";
	}

	const model = await directModel("reading", "thread-digest");
	const object = await askJson(
		model,
		lenientDigestSchema,
		[
			"You read one email conversation and write one short line for each message.",
			UNTRUSTED_RULE,
			`Write every line in ${language()}, at most 20 words, in the present tense.`,
			"A line never names its sender and never starts with WE or THEY. It starts with the verb.",
			"Say what the message asks, offers, confirms or answers. Name quantities and products when the message names them.",
			"Report only what the message says. Never invent a fact.",
			`Leave out the greeting, the sign-off and the signature. Write a range as ${say("'800 to 1000'", "'800 bis 1000'")}, never with a dash.`,
			"Answer with one line for every numbered message, with its number.",
		].join("\n"),
		untrusted(
			`Subject: ${thread.subject ?? "(no subject)"}\n\n${transcript(thread)}`,
		),
		threadDigestSchema,
	);

	const written = await storeMessageSummaries(thread, object.messageSummaries);
	return written === 1
		? "1 message now has a line."
		: `${written} messages now have a line.`;
}
