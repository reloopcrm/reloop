import { z } from "zod";
import { RESEARCH } from "./research-config";

export type Answer = {
	text: string;
	citations: string[];
};

type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export type AskOptions = {
	model?: "sonar" | "sonar-pro";
	domains?: string[];
	system?: string;
};

const perplexityAnswer = z.object({
	choices: z
		.array(
			z.object({
				message: z.object({ content: z.string().nullish() }).nullish(),
			}),
		)
		.nullish(),
	citations: z.array(z.string()).nullish(),
	search_results: z.array(z.object({ url: z.string().nullish() })).nullish(),
});

export async function ask(
	question: string,
	options: AskOptions = {},
): Promise<Outcome<Answer>> {
	const apiKey = process.env.PERPLEXITY_API_KEY;
	if (!apiKey) return { ok: false, reason: "No PERPLEXITY_API_KEY." };

	const { endpoint, timeoutMs } = RESEARCH.perplexity;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify({
				model: options.model ?? "sonar",
				messages: [
					...(options.system
						? [{ role: "system", content: options.system }]
						: []),
					{ role: "user", content: question },
				],
				search_domain_filter: options.domains,
			}),
		});

		if (!response.ok) {
			return { ok: false, reason: `HTTP ${response.status}` };
		}

		const parsed = perplexityAnswer.safeParse(await response.json());
		if (!parsed.success) {
			return {
				ok: false,
				reason: `Unreadable answer: ${parsed.error.issues[0]?.message ?? "wrong shape"}.`,
			};
		}

		const body = parsed.data;
		const text = body.choices?.[0]?.message?.content?.trim() ?? "";
		if (!text) return { ok: false, reason: "Empty answer." };

		const citations =
			body.citations ??
			(body.search_results ?? []).flatMap((result) =>
				result.url ? [result.url] : [],
			);

		return { ok: true, data: { text, citations } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${timeoutMs}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}
