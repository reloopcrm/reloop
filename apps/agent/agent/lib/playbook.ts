import { db } from "@crm/db";
import { MEMORY } from "@crm/db/insights";
import { SETTINGS_ID } from "@crm/db/settings";
import { streamText } from "ai";
import { z } from "zod";
import { language } from "./language";
import { directModel } from "./model";

export const PLAYBOOK = {
	sampleMessages: 40,
	bodyMaxChars: 1_200,
	learnEvery: 25,
	minMessages: 5,
	summaryMaxChars: 1_800,
} as const;

export const playbookSchema = z.object({
	offers: z.array(z.string().max(160)).max(12),
	prices: z.array(z.string().max(160)).max(12),
	conditions: z.array(z.string().max(160)).max(12),
	accepts: z.array(z.string().max(160)).max(10),
	declines: z.array(z.string().max(160)).max(10),
	tone: z.string().max(300),
	phrases: z.array(z.string().max(160)).max(10),
	summary: z.string().max(PLAYBOOK.summaryMaxChars),
});

export type Playbook = z.infer<typeof playbookSchema>;

export async function readPlaybook(): Promise<Playbook | null> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { workspacePlaybook: true },
	});
	const parsed = playbookSchema.safeParse(row?.workspacePlaybook);
	return parsed.success ? parsed.data : null;
}

export function playbookPrompt(playbook: Playbook | null): string {
	if (!playbook) return "";

	return [
		"How this workspace usually answers, learned from its own sent emails:",
		playbook.summary,
		playbook.offers.length
			? `Typical offers: ${playbook.offers.join("; ")}`
			: "",
		playbook.prices.length
			? `Price orientation, averages from past emails that change over time and are never a rule: ${playbook.prices.join("; ")}`
			: "",
		playbook.conditions.length
			? `Typical conditions: ${playbook.conditions.join("; ")}`
			: "",
		playbook.accepts.length
			? `Usually accepted: ${playbook.accepts.join("; ")}`
			: "",
		playbook.declines.length
			? `Usually declined: ${playbook.declines.join("; ")}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

export async function playbookDue(): Promise<boolean> {
	const [row, outbound] = await Promise.all([
		db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { playbookOutboundCount: true, workspacePlaybook: true },
		}),
		db.emailMessage.count({ where: { direction: "OUTBOUND" } }),
	]);

	if (outbound < PLAYBOOK.minMessages) return false;
	if (!row?.workspacePlaybook) return true;

	return outbound - (row.playbookOutboundCount ?? 0) >= PLAYBOOK.learnEvery;
}

export async function runPlaybookLearn(): Promise<string> {
	const [messages, outbound] = await Promise.all([
		db.emailMessage.findMany({
			where: { direction: "OUTBOUND" },
			orderBy: { sentAt: "desc" },
			take: PLAYBOOK.sampleMessages,
			select: {
				subject: true,
				body: true,
				snippet: true,
				sentAt: true,
				thread: {
					select: {
						insight: {
							select: { outcome: true, relevant: true, summary: true },
						},
					},
				},
			},
		}),
		db.emailMessage.count({ where: { direction: "OUTBOUND" } }),
	]);

	if (messages.length < PLAYBOOK.minMessages) {
		return `Only ${messages.length} sent emails so far; nothing to learn yet.`;
	}

	const existing = await readPlaybook();
	const model = await directModel("reading", "playbook-learn");

	const sample = messages
		.map((message, index) => {
			const outcome = message.thread.insight
				? ` [${message.thread.insight.relevant ? message.thread.insight.outcome : "off-topic"}]`
				: "";
			const body = (message.body ?? message.snippet ?? "").slice(
				0,
				PLAYBOOK.bodyMaxChars,
			);
			return `#${index + 1} ${message.sentAt.toISOString().slice(0, 10)}${outcome} ${message.subject ?? ""}\n${body}`;
		})
		.join("\n\n---\n\n");

	const system = [
		"You study the emails a sales rep sent and write down how they do business, so an assistant can judge new conversations the same way.",
		"Report only what the emails show: products offered, delivery and payment conditions, which requests the rep accepted and which they declined, how they speak to customers, recurring phrases.",
		"Prices change all the time. Never state a price as a rule. Put prices only into the prices list, as averages or typical ranges per product and quality with the month or period they were seen, for example 'Product A: mostly 8.50 to 9.20 EUR (May to July 2026)'. Keep prices out of offers, conditions and summary.",
		`Write everything in ${language()}. The summary is at most ${PLAYBOOK.summaryMaxChars} characters.`,
		"Merge with the existing playbook when one is given; keep what still holds, drop nothing that still matters.",
		"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
		JSON.stringify(z.toJSONSchema(playbookSchema)),
	].join("\n");

	const prompt = `${existing ? `Existing playbook:\n${JSON.stringify(existing)}\n\n` : ""}Sent emails (${messages.length}):\n${sample}`;

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

		try {
			const cleaned = text.replace(/```(?:json)?/gi, "").trim();
			const parsed = playbookSchema.safeParse(
				JSON.parse(
					cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
				),
			);
			if (!parsed.success) {
				lastError = parsed.error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join("; ")
					.slice(0, 400);
				continue;
			}

			await db.appSetting.upsert({
				where: { id: SETTINGS_ID },
				create: {
					id: SETTINGS_ID,
					workspacePlaybook: parsed.data,
					playbookOutboundCount: outbound,
					playbookLearnedAt: new Date(),
				},
				update: {
					workspacePlaybook: parsed.data,
					playbookOutboundCount: outbound,
					playbookLearnedAt: new Date(),
				},
			});

			return `Learned from ${messages.length} sent emails: ${parsed.data.summary.slice(0, 160)}`;
		} catch (error) {
			lastError =
				`not valid JSON (${error instanceof Error ? error.message : String(error)})`.slice(
					0,
					200,
				);
		}
	}

	throw new Error(`The model did not return a usable playbook: ${lastError}`);
}

export function playbookVoicePrompt(playbook: Playbook | null): string {
	if (!playbook) return "";

	return [
		playbook.tone ? `How the sender speaks to customers: ${playbook.tone}` : "",
		playbook.phrases.length
			? `Phrases he uses again and again: ${playbook.phrases.join("; ")}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}
