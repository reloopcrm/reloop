import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { TYPESAFE } from "@crm/db/typesafe";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import type { WinBackRules } from "@crm/validation/win-back-rules";
import {
	classifyThread,
	gateState,
	type ThreadVerdict,
} from "../agent/lib/insight";
import { askJev, type JevState } from "../agent/lib/jev";

const KEY = "ts-test-key";

const rules: WinBackRules = {
	...DEFAULT_WIN_BACK_RULES,
	business: {
		...DEFAULT_WIN_BACK_RULES.business,
		description: "We buy and sell Europaletten across Germany.",
	},
};

const thread = {
	id: "t1",
	subject: "Anfrage 620 Paletten",
	contactId: "c1",
	lastMessageAt: new Date("2026-09-14T09:00:00.000Z"),
	messages: [
		{
			id: "m1",
			direction: "INBOUND",
			fromEmail: "them@example.com",
			fromName: "Anna",
			sentAt: new Date("2026-09-13T09:00:00.000Z"),
			body: "Wir brauchen 620 Europaletten.",
			snippet: null,
		},
	],
};

const bigVerdict: ThreadVerdict = {
	relevant: true,
	topics: ["Paletten"],
	side: "THEY_BUY",
	products: ["Europalette"],
	quantityPallets: 620,
	loads: null,
	outcome: "OPEN_INQUIRY_THEIRS",
	unansweredByUs: true,
	summary: "Sie fragen 620 Paletten an.",
	evidence: [],
	messageSummaries: [],
};

function bigModel() {
	const calls: string[] = [];

	return {
		calls,
		run: async () => {
			calls.push(thread.id);
			return { verdict: bigVerdict, modelId: "big-model" };
		},
	};
}

function answering(noul: number) {
	const states: JevState[] = [];

	return {
		states,
		ask: async (_key: string, state: JevState) => {
			states.push(state);
			return noul;
		},
	};
}

const saved = process.env[TYPESAFE.envVar];

beforeEach(() => {
	process.env[TYPESAFE.envVar] = KEY;
});

afterEach(() => {
	if (saved === undefined) delete process.env[TYPESAFE.envVar];
	else process.env[TYPESAFE.envVar] = saved;
});

describe("the cheap gate in front of the thread classifier", () => {
	it("never asks Jev and reads once with the big model when there is no key", async () => {
		delete process.env[TYPESAFE.envVar];

		const big = bigModel();
		const gate = answering(0.01);

		const result = await classifyThread(thread, rules, gate.ask, big.run);

		expect(gate.states).toHaveLength(0);
		expect(big.calls).toHaveLength(1);
		expect(result.modelId).toBe("big-model");
	});

	it("skips the big model when Jev is clearly sure it is not business", async () => {
		const big = bigModel();
		const gate = answering(0.1);

		const result = await classifyThread(thread, rules, gate.ask, big.run);

		expect(big.calls).toHaveLength(0);
		expect(result.modelId).toBe(TYPESAFE.model);
		expect(result.verdict).toEqual({
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
		});
	});

	it("reads once with the big model when Jev says it is business", async () => {
		const big = bigModel();
		const gate = answering(0.9);

		const result = await classifyThread(thread, rules, gate.ask, big.run);

		expect(big.calls).toHaveLength(1);
		expect(result.verdict.relevant).toBe(true);
	});

	it("reads once with the big model when Jev answers exactly at the threshold", async () => {
		const big = bigModel();
		const gate = answering(TYPESAFE.gate.threshold);

		await classifyThread(thread, rules, gate.ask, big.run);

		expect(big.calls).toHaveLength(1);
	});

	it("reads once with the big model when the workspace has no business text", async () => {
		const big = bigModel();
		const gate = answering(0.01);
		const blank: WinBackRules = {
			...rules,
			business: { ...rules.business, description: "  " },
		};

		await classifyThread(thread, blank, gate.ask, big.run);

		expect(gate.states).toHaveLength(0);
		expect(big.calls).toHaveLength(1);
	});

	it("sends the business, the subject and the transcript", async () => {
		const big = bigModel();
		const gate = answering(0.9);

		await classifyThread(thread, rules, gate.ask, big.run);

		const state = gate.states[0];
		expect(state?.business).toContain(
			"We buy and sell Europaletten across Germany.",
		);
		expect(state?.subject).toBe("Anfrage 620 Paletten");
		expect(state?.transcript).toContain("620 Europaletten");
	});
});

describe("the Jev request", () => {
	it("carries the business, the subject, the transcript and one noul", async () => {
		type JevBody = {
			state: JevState;
			model: string;
			questions: Record<string, { type: string; instructions: string }>;
		};

		let sent: JevBody | null = null;

		await askJev(KEY, await gateState(thread, rules), {
			fetchImpl: (async (_url: string, init: RequestInit) => {
				sent = JSON.parse(String(init.body));
				return Response.json({
					model: TYPESAFE.model,
					answers: { [TYPESAFE.gate.question]: { type: "noul", noul: 0.5 } },
					usage: { input_tokens: 360, output_tokens: 39 },
				});
			}) as unknown as typeof fetch,
		});

		const body = sent as JevBody;

		expect(body.model).toBe(TYPESAFE.model);
		expect(Object.keys(body.questions)).toEqual([TYPESAFE.gate.question]);
		expect(body.questions[TYPESAFE.gate.question]?.type).toBe("noul");
		expect(body.questions[TYPESAFE.gate.question]?.instructions).toContain(
			"business",
		);
		expect(body.state.business).toContain(
			"We buy and sell Europaletten across Germany.",
		);
		expect(body.state.subject).toBe("Anfrage 620 Paletten");
		expect(body.state.transcript).toContain("620 Europaletten");
	});

	it("reads the answer when Jev answers well", async () => {
		const noul = await askJev(KEY, await gateState(thread, rules), {
			fetchImpl: (async () =>
				Response.json({
					answers: { [TYPESAFE.gate.question]: { type: "noul", noul: 0.07 } },
				})) as unknown as typeof fetch,
		});

		expect(noul).toBe(0.07);
	});
});

describe("Jev failing never reaches the rep", () => {
	const state: JevState = {
		business: "We buy and sell Europaletten.",
		subject: "Anfrage",
		transcript: "1. THEY: 620 Paletten",
	};

	it("answers nothing on a 500", async () => {
		expect(
			await askJev(KEY, state, {
				fetchImpl: (async () =>
					new Response("boom", { status: 500 })) as unknown as typeof fetch,
			}),
		).toBeNull();
	});

	it("answers nothing on a 401", async () => {
		expect(
			await askJev(KEY, state, {
				fetchImpl: (async () =>
					new Response("no", { status: 401 })) as unknown as typeof fetch,
			}),
		).toBeNull();
	});

	it("answers nothing when the body is not JSON", async () => {
		expect(
			await askJev(KEY, state, {
				fetchImpl: (async () =>
					new Response("<html>", { status: 200 })) as unknown as typeof fetch,
			}),
		).toBeNull();
	});

	it("answers nothing when the JSON has no noul", async () => {
		expect(
			await askJev(KEY, state, {
				fetchImpl: (async () =>
					Response.json({ answers: {} })) as unknown as typeof fetch,
			}),
		).toBeNull();
	});

	it("answers nothing when the network throws", async () => {
		expect(
			await askJev(KEY, state, {
				fetchImpl: (async () => {
					throw new Error("ECONNREFUSED");
				}) as unknown as typeof fetch,
			}),
		).toBeNull();
	});

	it("reads with the big model after Jev fails", async () => {
		const big = bigModel();

		const result = await classifyThread(
			thread,
			rules,
			(key, sent) =>
				askJev(key, sent, {
					fetchImpl: (async () =>
						new Response("boom", { status: 500 })) as unknown as typeof fetch,
				}),
			big.run,
		);

		expect(big.calls).toHaveLength(1);
		expect(result.modelId).toBe("big-model");
	});
});

describe("the call is capped in time", () => {
	it("gives up on a request that never answers", async () => {
		const started = Date.now();

		const noul = await askJev(
			KEY,
			{ business: "b", subject: "s", transcript: "t" },
			{
				timeoutMs: 40,
				fetchImpl: (() =>
					new Promise(() => undefined)) as unknown as typeof fetch,
			},
		);

		expect(noul).toBeNull();
		expect(Date.now() - started).toBeLessThan(2_000);
	});

	it("gives up even when the abort signal is never honoured", async () => {
		const noul = await askJev(
			KEY,
			{ business: "b", subject: "s", transcript: "t" },
			{
				timeoutMs: 40,
				fetchImpl: ((_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener("abort", () => undefined);
						setTimeout(() => reject(new Error("too late")), 5_000).unref?.();
					})) as unknown as typeof fetch,
			},
		);

		expect(noul).toBeNull();
	});
});
