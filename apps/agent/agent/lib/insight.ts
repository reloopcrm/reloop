import { db } from "@crm/db";
import {
	INSIGHT_OUTCOMES,
	INSIGHT_SIDES,
	MEMORY,
	THREAD_CLASSIFICATION,
} from "@crm/db/insights";
import { threadsOfContact } from "@crm/db/thread-participants";
import { TYPESAFE } from "@crm/db/typesafe";
import type { SummaryLanguage } from "@crm/validation/agent-language";
import { summaryIsStale } from "@crm/validation/agent-language";
import { clampAtWord } from "@crm/validation/summary-text";
import {
	readWinBackRules,
	type WinBackRules,
} from "@crm/validation/win-back-rules";
import { streamText } from "ai";
import { z } from "zod";
import { COPY } from "./copy";
import { askJev, type JevAsk, type JevState, typesafeKey } from "./jev";
import { countGate, countGateFailure } from "./jev-meter";
import { say, summaryLanguage, summaryWrittenIn } from "./language";
import { directModel } from "./model";
import { MODEL } from "./model-config";
import { playbookPrompt, readPlaybook } from "./playbook";
import { UNTRUSTED_RULE, untrusted } from "./untrusted";

function clamped(max: number) {
	return z.string().transform((text) => text.slice(0, max));
}

function clampedAtWord(max: number) {
	return z.string().transform((text) => clampAtWord(text, max));
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
			"What this one message says or asks, in the language the instructions name, no greeting.",
		),
});

const evidenceLine = z.object({
	quote: z.string().max(MEMORY.evidenceQuoteMaxChars),
	message: z
		.number()
		.int()
		.min(1)
		.describe("The number in front of the message the quote comes from."),
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
		.array(evidenceLine)
		.max(4)
		.describe(
			"Short quotes from the messages that support the verdict, each with the number of the message it comes from.",
		),
	messageSummaries: z
		.array(messageSummary)
		.max(MEMORY.messagesPerThread)
		.describe(
			"One line for every numbered message in the transcript, in the language the instructions name, each at most 20 words.",
		),
});

const lenientInsightSchema = threadInsightSchema.extend({
	topics: capped(clamped(60), 8),
	products: capped(clamped(60), 8),
	summary: clampedAtWord(MEMORY.threadSummaryMaxChars),
	evidence: capped(
		z.object({
			quote: clamped(MEMORY.evidenceQuoteMaxChars),
			message: z.number().int().min(1),
		}),
		4,
	),
	messageSummaries: capped(
		z.object({
			message: z.number().int().min(1),
			summary: clampedAtWord(MEMORY.messageSummaryMaxChars),
		}),
		MEMORY.messagesPerThread,
	),
});

const lenientDigestSchema = threadDigestSchema.extend({
	messageSummaries: capped(
		z.object({
			message: z.number().int().min(1),
			summary: clampedAtWord(MEMORY.messageSummaryMaxChars),
		}),
		MEMORY.messagesPerThread,
	),
});

export type ThreadInsightVerdict = z.infer<typeof threadInsightSchema>;

export type ThreadVerdict = Omit<ThreadInsightVerdict, "side"> & {
	side: ThreadInsightVerdict["side"] | null;
};

const GATE_SKIPPED: ThreadVerdict = {
	relevant: false,
	topics: [],
	side: null,
	products: [],
	quantityPallets: null,
	loads: null,
	outcome: "OTHER",
	unansweredByUs: false,
	summary: "",
	evidence: [],
	messageSummaries: [],
};

const memorySchema = z.object({
	summary: z.string().max(MEMORY.summaryMaxChars),
	brief: z.string().max(MEMORY.briefMaxChars),
});

const lenientMemorySchema = z.object({
	summary: clampedAtWord(MEMORY.summaryMaxChars),
	brief: clampedAtWord(MEMORY.briefMaxChars),
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

export async function businessPrompt(rules: WinBackRules): Promise<string> {
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
	limits: Pick<
		Parameters<typeof streamText>[0],
		"maxOutputTokens" | "providerOptions"
	> = {},
): Promise<T> {
	let lastError = "";

	for (let attempt = 0; attempt < MEMORY.jsonAttempts; attempt += 1) {
		const result = streamText({
			model,
			abortSignal: AbortSignal.timeout(MEMORY.callTimeoutMs),
			maxOutputTokens: limits.maxOutputTokens,
			providerOptions: limits.providerOptions,
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

		if (limits.maxOutputTokens && (await result.finishReason) === "length") {
			throw new Error(
				`The answer ran past its limit of ${limits.maxOutputTokens} output tokens, so it was cut off.`,
			);
		}

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

export async function gateState(
	thread: ThreadRecord,
	rules: WinBackRules,
): Promise<JevState> {
	return {
		business: (await businessPrompt(rules)).slice(
			0,
			TYPESAFE.gate.businessMaxChars,
		),
		subject: thread.subject ?? "",
		transcript: transcript(thread),
	};
}

export type GateAnswer = "skip" | "read" | "unavailable";

export type ThreadClassification = {
	verdict: ThreadVerdict;
	modelId: string;
};

export const NEEDS_FULL_READ = new Error(
	"This conversation needs the full read, and no model provider is available.",
);

export const GATE_UNAVAILABLE = new Error("The cheap gate did not answer.");

const THREAD_GATE = "thread-insight";
const GATE_WORD = "skipped";

async function askGate(
	thread: ThreadRecord,
	rules: WinBackRules,
	ask: JevAsk,
): Promise<GateAnswer> {
	if (!rules.business.description.trim()) return "unavailable";

	const key = await typesafeKey();
	if (!key) return "unavailable";

	const noul = await ask(key, await gateState(thread, rules)).catch(() => null);

	if (noul === null) {
		countGateFailure(THREAD_GATE, GATE_WORD);
		return "unavailable";
	}

	const skip = noul < TYPESAFE.gate.threshold;
	countGate(THREAD_GATE, skip, GATE_WORD);

	return skip ? "skip" : "read";
}

function gateOnlyVerdict(answer: GateAnswer): ThreadClassification {
	if (answer === "unavailable") throw GATE_UNAVAILABLE;
	if (answer === "read") throw NEEDS_FULL_READ;

	return { verdict: GATE_SKIPPED, modelId: TYPESAFE.model };
}

export async function classifyThread(
	thread: ThreadRecord,
	rules: WinBackRules,
	ask: JevAsk = askJev,
	expensive: (
		thread: ThreadRecord,
		rules: WinBackRules,
	) => Promise<ThreadClassification> = classifyWithModel,
): Promise<ThreadClassification> {
	if ((await askGate(thread, rules, ask)) === "skip") {
		return { verdict: GATE_SKIPPED, modelId: TYPESAFE.model };
	}

	return expensive(thread, rules);
}

async function classifyWithModel(
	thread: ThreadRecord,
	rules: WinBackRules,
): Promise<ThreadClassification> {
	const model = await directModel("reading", "thread-insight");
	const writtenIn = summaryWrittenIn();

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
			`Write the summary in ${writtenIn}, at most three sentences, naming what was discussed and where it ended.`,
			"Every evidence quote is copied from one message and names the number of that message.",
			`messageSummaries holds one line in ${writtenIn} for every numbered message, with its number, each at most 20 words.`,
			"A message line never names its sender and never starts with WE or THEY. It starts with the verb.",
			"A message line leaves out the greeting, the sign-off and the signature. Write a range with the word for to in that language, as in '800 to 1000', never with a dash.",
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
	added: { threadId: string; verdict: ThreadVerdict },
	buildModel: typeof directModel = directModel,
): Promise<void> {
	const existing = await db.contactMemory.findUnique({ where: { contactId } });
	const wanted = summaryLanguage();
	const fresh =
		existing !== null &&
		existing.brief !== null &&
		existing.language === wanted;
	if (fresh && existing.coveredThreadIds.includes(added.threadId)) return;

	const insights = await db.threadInsight.findMany({
		where: { thread: threadsOfContact(contactId), relevant: true },
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
	let brief = existing?.brief ?? null;
	let language = existing?.language ?? null;
	let modelId = existing?.modelId ?? null;

	if (added.verdict.relevant || (!fresh && summary.length > 0)) {
		const model = await buildModel("reading", "contact-memory");
		const writtenIn = summaryWrittenIn(wanted);
		const object = await askJson(
			model,
			lenientMemorySchema,
			[
				"You maintain a short running memory about one business contact for a sales rep.",
				`summary: under ${MEMORY.summaryMaxChars} characters, in ${writtenIn}, facts only: what they buy or sell, quantities, prices if stated, what was agreed, what is still open, how the relationship ended.`,
				"Merge the new conversation into the existing memory. Drop nothing that still matters, repeat nothing. Rewrite the existing memory in that language when it is written in another one.",
				`brief: at most three short sentences and under ${MEMORY.briefMaxChars} characters, in ${writtenIn}, for a rep who opens this contact: where things stand, what is still open, and who acts next. One overall picture, never one sentence per conversation. Name a number only when the next step depends on it.`,
				UNTRUSTED_RULE,
				await businessPrompt(rules),
			].join("\n"),
			untrusted(
				added.verdict.relevant
					? `Existing memory:\n${summary || "(empty)"}\n\nNew conversation (${added.verdict.outcome}):\n${added.verdict.summary}`
					: `Existing memory:\n${summary}`,
			),
			memorySchema,
		);
		summary = object.summary;
		brief = object.brief;
		language = wanted;
		modelId = model.modelId;
	}

	const coveredThreadIds = [
		...new Set([...(existing?.coveredThreadIds ?? []), added.threadId]),
	];

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
			coveredThreadIds,
			brief,
			language,
			modelId,
		},
		update: {
			summary,
			didBusiness,
			openInquiries,
			maxPallets,
			products,
			lastOutcome,
			coveredThreadIds,
			brief,
			language,
			modelId,
		},
	});
}

export async function memoryContactsOf(thread: {
	id: string;
	contactId: string | null;
}): Promise<string[]> {
	const linked = await db.emailThreadContact.findMany({
		where: {
			threadId: thread.id,
			contact: { archivedAt: null },
			contactId: thread.contactId ? { not: thread.contactId } : undefined,
		},
		orderBy: { firstAt: "asc" },
		take: MEMORY.linkedContactsPerThread,
		select: { contactId: true },
	});

	return [
		...(thread.contactId ? [thread.contactId] : []),
		...linked.map((link) => link.contactId),
	];
}

async function refreshMemories(
	thread: { id: string; contactId: string | null },
	rules: WinBackRules,
	verdict: ThreadVerdict,
	buildModel: typeof directModel,
): Promise<void> {
	for (const contactId of await memoryContactsOf(thread)) {
		await refreshMemory(
			contactId,
			rules,
			{ threadId: thread.id, verdict },
			buildModel,
		);
	}
}

export type ReadPlan = "stored" | "classify" | "keepRelevant";

export function readPlan(
	reread: boolean,
	insight: { relevant: boolean; lastMessageAt: Date } | null,
	lastMessageAt: Date,
): ReadPlan {
	if (!insight) return "classify";
	if (reread) return insight.relevant ? "keepRelevant" : "stored";
	return insight.lastMessageAt.getTime() === lastMessageAt.getTime()
		? "stored"
		: "classify";
}

export async function rereadRelevant(
	thread: ThreadRecord,
	rules: WinBackRules,
	expensive: (
		thread: ThreadRecord,
		rules: WinBackRules,
	) => Promise<ThreadClassification> = classifyWithModel,
): Promise<ThreadClassification> {
	const result = await expensive(thread, rules);
	return { ...result, verdict: { ...result.verdict, relevant: true } };
}

function storedVerdict(stored: {
	relevant: boolean;
	topics: string[];
	side: string | null;
	products: string[];
	quantityPallets: number | null;
	loads: number | null;
	outcome: string;
	unansweredByUs: boolean;
	summary: string;
}): ThreadVerdict {
	return {
		relevant: stored.relevant,
		topics: stored.topics,
		side: (stored.side ?? "UNCLEAR") as ThreadInsightVerdict["side"],
		products: stored.products,
		quantityPallets: stored.quantityPallets,
		loads: stored.loads,
		outcome: stored.outcome as ThreadInsightVerdict["outcome"],
		unansweredByUs: stored.unansweredByUs,
		summary: stored.summary,
		evidence: [],
		messageSummaries: [],
	};
}

export async function runThreadInsight(
	threadId: string,
	gateOnly = false,
	reread = false,
	buildModel: typeof directModel = directModel,
): Promise<string> {
	const thread = await db.emailThread.findUnique({
		where: { id: threadId },
		select: {
			id: true,
			subject: true,
			contactId: true,
			lastMessageAt: true,
			classification: true,
			insight: { select: { lastMessageAt: true, relevant: true } },
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

	if (!thread) return say(COPY.threads.gone);
	if (thread.messages.length === 0) return say(COPY.threads.empty);

	const rules = await readWinBackRules(db);
	const plan = readPlan(reread, thread.insight, thread.lastMessageAt);
	if (plan === "keepRelevant" && gateOnly) throw NEEDS_FULL_READ;

	let verdict: ThreadVerdict;

	if (plan === "stored") {
		verdict = storedVerdict(
			await db.threadInsight.findUniqueOrThrow({ where: { threadId } }),
		);
	} else {
		const result =
			plan === "keepRelevant"
				? await rereadRelevant(thread, rules)
				: gateOnly
					? gateOnlyVerdict(await askGate(thread, rules, askJev))
					: await classifyThread(thread, rules);
		verdict = result.verdict;

		await storeMessageSummaries(thread, verdict.messageSummaries);

		const { messageSummaries: _lines, evidence, ...row } = verdict;
		const quoted = quotedMessages(thread, evidence);
		const language = summaryLanguage();
		await db.threadInsight.upsert({
			where: { threadId },
			create: {
				threadId,
				...row,
				...quoted,
				language,
				modelId: result.modelId,
				lastMessageAt: thread.lastMessageAt,
			},
			update: {
				...row,
				...quoted,
				language,
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

	await refreshMemories(thread, rules, verdict, buildModel);

	if (!verdict.relevant) {
		const why = verdict.summary.slice(0, 120);
		return say(why ? COPY.threads.offTopicBecause(why) : COPY.threads.offTopic);
	}

	const units = verdict.quantityPallets
		? `, ${say(COPY.threads.units(verdict.quantityPallets))}`
		: "";
	return `${verdict.outcome}${units}: ${verdict.summary.slice(0, 160)}`;
}

export function refreshedSummary(
	stored: string,
	written: string,
	wanted: SummaryLanguage,
) {
	return { summary: written.trim() || stored, language: wanted };
}

export async function runSummaryRefresh(
	threadId: string,
	options: { memoryOnly?: boolean; buildModel?: typeof directModel } = {},
): Promise<string> {
	const thread = await db.emailThread.findUnique({
		where: { id: threadId },
		select: {
			id: true,
			subject: true,
			contactId: true,
			lastMessageAt: true,
			insight: true,
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

	if (!thread) return say(COPY.threads.gone);
	if (thread.messages.length === 0) return say(COPY.threads.empty);

	const insight = thread.insight;
	if (!insight?.relevant || !insight.summary.trim()) {
		return say(COPY.threads.notRefreshed);
	}

	const rules = await readWinBackRules(db);
	const wanted = summaryLanguage();
	let summary = insight.summary;

	if (!options.memoryOnly && summaryIsStale(insight.language, wanted)) {
		const { verdict } = await classifyWithModel(thread, rules);
		await storeMessageSummaries(thread, verdict.messageSummaries);

		const data = refreshedSummary(insight.summary, verdict.summary, wanted);
		await db.threadInsight.update({ where: { threadId }, data });
		summary = data.summary;
	}

	await refreshMemories(
		thread,
		rules,
		storedVerdict({ ...insight, summary }),
		options.buildModel ?? directModel,
	);

	return say(COPY.threads.refreshed);
}

export function quotedMessages(
	thread: ThreadRecord,
	lines: readonly z.infer<typeof evidenceLine>[],
) {
	const recent = thread.messages.slice(-MEMORY.messagesPerThread);

	return {
		evidence: lines.map((line) => line.quote),
		evidenceMessageIds: lines.map((line) => recent[line.message - 1]?.id ?? ""),
	};
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

	if (!thread) return say(COPY.threads.gone);

	const recent = thread.messages.slice(-MEMORY.messagesPerThread);
	if (recent.length === 0) return say(COPY.threads.empty);
	if (recent.every((message) => message.summary !== null)) {
		return say(COPY.threads.allLined);
	}

	const model = await directModel("reading", "thread-digest");
	const object = await askJson(
		model,
		lenientDigestSchema,
		[
			"You read one email conversation and write one short line for each message.",
			UNTRUSTED_RULE,
			`Write every line in ${summaryWrittenIn()}, at most 20 words, in the present tense.`,
			"A line never names its sender and never starts with WE or THEY. It starts with the verb.",
			"Say what the message asks, offers, confirms or answers. Name quantities and products when the message names them.",
			"Report only what the message says. Never invent a fact.",
			"Leave out the greeting, the sign-off and the signature. Write a range with the word for to in that language, as in '800 to 1000', never with a dash.",
			"Answer with one line for every numbered message, with its number.",
		].join("\n"),
		untrusted(
			`Subject: ${thread.subject ?? "(no subject)"}\n\n${transcript(thread)}`,
		),
		threadDigestSchema,
	);

	const written = await storeMessageSummaries(thread, object.messageSummaries);
	return say(COPY.threads.lined(written));
}
