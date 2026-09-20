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

export type JevAsk = (key: string, state: JevState) => Promise<number | null>;

const noulAnswer = z.object({
	answers: z.object({
		[TYPESAFE.gate.question]: z.object({
			type: z.literal("noul").optional(),
			noul: z.number().min(0).max(1),
		}),
	}),
});

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

function gateQuestion() {
	return {
		[TYPESAFE.gate.question]: {
			type: "noul",
			instructions:
				"The state holds the workspace's own business, the subject of one email conversation from its mailbox, and the messages in it. Is this conversation about that business?",
			criteria: {
				true: "The conversation is about buying, selling, quoting, delivering, paying for or arranging the goods or services the workspace describes, with a customer, a supplier or a partner.",
				false:
					"The conversation is a newsletter, an advertisement, a notification from a tool, a receipt, a job application, spam or private mail, or it is about something the workspace does not trade in.",
			},
		},
	};
}

export async function askJev(
	key: string,
	state: JevState,
	{
		fetchImpl = fetch,
		timeoutMs = TYPESAFE.gate.timeoutMs,
	}: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<number | null> {
	const controller = new AbortController();

	const work = (async (): Promise<number | null> => {
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
					questions: gateQuestion(),
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				console.error(`[agent] Jev answered ${response.status}`);
				return null;
			}

			const parsed = noulAnswer.safeParse(await response.json());

			if (!parsed.success) {
				console.error("[agent] Jev sent an answer this agent cannot read");
				return null;
			}

			return parsed.data.answers[TYPESAFE.gate.question].noul;
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
