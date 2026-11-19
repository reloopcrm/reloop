import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { TYPESAFE } from "@crm/db/typesafe";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import type { WinBackRules } from "@crm/validation/win-back-rules";
import {
	answersMissingMail,
	classifyThread,
	MISSING_MAIL_NOTE,
	missingMailNote,
	readPlan,
	type ThreadVerdict,
} from "../agent/lib/insight";
import type { JevState } from "../agent/lib/jev";

const AT = new Date("2026-05-04T08:30:00.000Z");

const rules: WinBackRules = {
	...DEFAULT_WIN_BACK_RULES,
	business: {
		...DEFAULT_WIN_BACK_RULES.business,
		description: "We buy and sell Europaletten across Germany.",
	},
};

function reply(overrides: { subject?: string; body?: string } = {}) {
	return {
		id: "t1",
		rootMessageId: "<campaign-1@sender.example>",
		subject: overrides.subject ?? "AW: Überschüssige Europaletten fair abgeben",
		contactId: null,
		lastMessageAt: AT,
		messages: [
			{
				id: "m1",
				rfcMessageId: "<reply-1@customer.example>",
				subject:
					overrides.subject ?? "AW: Überschüssige Europaletten fair abgeben",
				direction: "INBOUND",
				fromEmail: "anna.schmidt@customer.example",
				fromName: "Anna Schmidt",
				sentAt: AT,
				body: overrides.body ?? "Bitte rufen Sie mich morgen an.",
				snippet: null,
			},
		],
	};
}

const firstMail = {
	...reply({ subject: "Anfrage" }),
	rootMessageId: "<reply-1@customer.example>",
};

const verdict: ThreadVerdict = {
	relevant: true,
	topics: ["Paletten"],
	side: "THEY_SELL",
	products: ["Europalette"],
	quantityPallets: null,
	loads: null,
	outcome: "OPEN_INQUIRY_THEIRS",
	declineKind: null,
	declinedAt: null,
	unansweredByUs: true,
	summary: "Sie bitten um einen Anruf.",
	evidence: [],
	messageSummaries: [],
};

function bigModel() {
	const calls: string[] = [];

	return {
		calls,
		run: async (thread: { id: string }) => {
			calls.push(thread.id);
			return { verdict, modelId: "big-model" };
		},
	};
}

function sureItIsNotBusiness() {
	const states: JevState[] = [];

	return {
		states,
		ask: async (_key: string, state: JevState) => {
			states.push(state);
			return 0.01;
		},
	};
}

const saved = process.env[TYPESAFE.envVar];

beforeEach(() => {
	process.env[TYPESAFE.envVar] = "ts-test-key";
});

afterEach(() => {
	if (saved === undefined) delete process.env[TYPESAFE.envVar];
	else process.env[TYPESAFE.envVar] = saved;
});

describe("a conversation that only holds their reply to our mail", () => {
	it("is recognised from the reply subject and the missing first mail", () => {
		expect(answersMissingMail(reply())).toBe(true);
		expect(answersMissingMail(firstMail)).toBe(false);
		expect(
			answersMissingMail(
				reply({
					subject: "Automatische Antwort: Überschüssige Europaletten",
					body: "Ich bin bis zum 12. Mai nicht im Büro.",
				}),
			),
		).toBe(false);
	});

	it("is never cleared by the cheap gate, because the gate sees one side only", async () => {
		const big = bigModel();
		const gate = sureItIsNotBusiness();

		const result = await classifyThread(reply(), rules, gate.ask, big.run);

		expect(gate.states).toHaveLength(0);
		expect(big.calls).toEqual(["t1"]);
		expect(result.verdict.relevant).toBe(true);
		expect(result.modelId).toBe("big-model");
	});

	it("still lets the gate clear a first mail from a stranger", async () => {
		const big = bigModel();
		const gate = sureItIsNotBusiness();

		const result = await classifyThread(firstMail, rules, gate.ask, big.run);

		expect(gate.states).toHaveLength(1);
		expect(big.calls).toHaveLength(0);
		expect(result.verdict.relevant).toBe(false);
	});

	it("tells the model that our own mail is missing", () => {
		expect(missingMailNote(reply())).toBe(MISSING_MAIL_NOTE);
		expect(missingMailNote(firstMail)).toBeNull();
	});

	it("is read again when the API asks, although the stored verdict says not relevant", () => {
		const stored = { relevant: false, lastMessageAt: AT };

		expect(readPlan(true, stored, AT, true)).toBe("classify");
		expect(readPlan(true, stored, AT, false)).toBe("stored");
		expect(readPlan(false, stored, AT, true)).toBe("stored");
	});
});
