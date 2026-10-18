import { db } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { openTypesafeKey, TYPESAFE } from "@crm/db/typesafe";
import { z } from "zod";
import { settledWithin } from "./deadline";

export type JevState = {
	business: string;
	subject: string;
	transcript: string;
};

export type JevFields = Record<string, string>;

export type JevAsk = (key: string, state: JevState) => Promise<number | null>;

export type JevQuestion = {
	type: "noul" | "choice";
	instructions: string;
	criteria: Record<string, string>;
};

export type JevOptions = {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
};

export type JevNoulAsk = (
	key: string,
	state: JevFields,
	id: string,
	question: JevQuestion,
	options?: JevOptions,
) => Promise<number | null>;

export type JevChoiceAnswer = {
	choice: string;
	confidence: number;
	probabilities: Record<string, number>;
};

export type JevChoiceAsk = (
	key: string,
	state: JevFields,
	id: string,
	question: JevQuestion,
	options: readonly string[],
	requestOptions?: JevOptions,
) => Promise<JevChoiceAnswer | null>;

const noulShape = z.object({
	type: z.literal("noul").optional(),
	noul: z.number().min(0).max(1),
});

function choiceShape(options: readonly string[]) {
	return z.object({
		type: z.literal("choice").optional(),
		choice: z.enum(options),
		confidence: z.number().min(0).max(1),
		probabilities: z.record(z.string(), z.number()),
	});
}

export async function storedTypesafeKey(): Promise<string | null> {
	try {
		const row = await db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { typesafeApiKey: true },
		});
		const sealed = row?.typesafeApiKey?.trim();

		return sealed ? openTypesafeKey(sealed) : null;
	} catch (error) {
		console.error(
			`[agent] the stored TypeSafe key could not be read: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}

export async function typesafeKey(
	env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
	return (await storedTypesafeKey()) ?? env[TYPESAFE.envVar]?.trim() ?? null;
}

function gateQuestion(): JevQuestion {
	return {
		type: "noul",
		instructions:
			"The state holds the workspace's own business, the subject of one email conversation from its mailbox, and the messages in it. Is this conversation about that business?",
		criteria: {
			true: "The conversation is about buying, selling, quoting, delivering, paying for or arranging the goods or services the workspace describes, with a customer, a supplier or a partner.",
			false:
				"The conversation is a newsletter, an advertisement, a notification from a tool, a receipt, a job application, spam or private mail, or it is about something the workspace does not trade in.",
		},
	};
}

async function askJevQuestion<Shape extends z.ZodType>(
	key: string,
	state: JevFields,
	id: string,
	question: JevQuestion,
	shape: Shape,
	{ fetchImpl = fetch, timeoutMs = TYPESAFE.gate.timeoutMs }: JevOptions = {},
): Promise<z.infer<Shape> | null> {
	const controller = new AbortController();
	const envelope = z.object({ answers: z.record(z.string(), shape) });

	const work = (async (): Promise<z.infer<Shape> | null> => {
		try {
			const response = await fetchImpl(TYPESAFE.endpoint, {
				method: "POST",
				headers: {
					authorization: `Bearer ${key}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					state,
					model: TYPESAFE.model,
					questions: { [id]: question },
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				console.error(`[agent] Jev answered ${response.status}`);
				return null;
			}

			const parsed = envelope.safeParse(await response.json());

			if (!parsed.success) {
				console.error("[agent] Jev sent an answer this agent cannot read");
				return null;
			}

			return parsed.data.answers[id] ?? null;
		} catch (error) {
			console.error(
				`[agent] Jev could not be reached: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return null;
		}
	})();

	const outcome = await settledWithin(work, timeoutMs);

	if (outcome.settled) return outcome.value;

	controller.abort();
	void work.catch(() => undefined);

	return null;
}

export async function askNoul(
	key: string,
	state: JevFields,
	id: string,
	question: JevQuestion,
	options: JevOptions = {},
): Promise<number | null> {
	const answer = await askJevQuestion(
		key,
		state,
		id,
		question,
		noulShape,
		options,
	);

	return answer?.noul ?? null;
}

export async function askChoice(
	key: string,
	state: JevFields,
	id: string,
	question: JevQuestion,
	options: readonly string[],
	requestOptions: JevOptions = {},
): Promise<JevChoiceAnswer | null> {
	const answer = await askJevQuestion(
		key,
		state,
		id,
		question,
		choiceShape(options),
		requestOptions,
	);
	if (!answer) return null;

	return {
		choice: answer.choice,
		confidence: answer.confidence,
		probabilities: answer.probabilities,
	};
}

export async function askJev(
	key: string,
	state: JevState,
	options: JevOptions = {},
): Promise<number | null> {
	return askNoul(key, state, TYPESAFE.gate.question, gateQuestion(), options);
}
