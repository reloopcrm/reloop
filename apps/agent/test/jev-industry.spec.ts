import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { TYPESAFE } from "@crm/db/typesafe";
import type { JevChoiceAsk, JevQuestion } from "../agent/lib/jev";
import { askChoice } from "../agent/lib/jev";
import { resetGateCounts } from "../agent/lib/jev-meter";
import { askIndustry, type Page } from "../agent/lib/website-brand";
import { WEBSITE } from "../agent/lib/website-config";

const KEY = "ts-industry-key";
const FREIGHT = "Logistics and freight";

const question: JevQuestion = {
	type: "choice",
	instructions: "Which industry does this company work in?",
	criteria: WEBSITE.industry.options,
};

const page: Page = {
	url: new URL("https://paletten-mueller.example.test/"),
	html: "",
	text: "Wir handeln mit Europaletten und liefern sie in ganz Deutschland.",
	title: "Paletten Mueller",
	siteName: "Paletten Mueller",
	metaDescription: "Europaletten kaufen und verkaufen",
	themeColor: null,
	icons: [],
	ogImage: null,
	links: [],
	mailto: [],
	tel: [],
};

function answering(choice: string, probability: number) {
	const sent: { options: readonly string[]; state: unknown }[] = [];

	const ask: JevChoiceAsk = async (_key, state, _id, _question, options) => {
		sent.push({ options, state });
		return {
			choice,
			confidence: probability,
			probabilities: { [choice]: probability },
		};
	};

	return { sent, ask };
}

function failing() {
	const sent: number[] = [];

	const ask: JevChoiceAsk = async () => {
		sent.push(1);
		return null;
	};

	return { sent, ask };
}

const saved = process.env[TYPESAFE.envVar];

beforeEach(() => {
	resetGateCounts();
	process.env[TYPESAFE.envVar] = KEY;
});

afterEach(() => {
	if (saved === undefined) delete process.env[TYPESAFE.envVar];
	else process.env[TYPESAFE.envVar] = saved;
});

describe("the industry choice over a fixed list", () => {
	it("never asks Jev when there is no key", async () => {
		delete process.env[TYPESAFE.envVar];

		const gate = answering(FREIGHT, 1);

		expect(await askIndustry(page, gate.ask)).toBeNull();
		expect(gate.sent).toHaveLength(0);
	});

	it("carries the whole list and the page", async () => {
		const gate = answering("Pallets and packaging", 0.95);

		expect(await askIndustry(page, gate.ask)).toBe("Pallets and packaging");

		const call = gate.sent[0];
		expect(call?.options).toEqual(Object.keys(WEBSITE.industry.options));
		expect(call?.options).toContain("Pallets and packaging");
		expect(call?.options).toContain(FREIGHT);
		expect(call?.options).toContain(WEBSITE.industry.noMatch);
		const state = call?.state as Record<string, string> | undefined;
		expect(state?.page).toContain("Europaletten");
	});

	it("keeps the free text answer when the list does not fit", async () => {
		const gate = answering(WEBSITE.industry.noMatch, 0.99);

		expect(await askIndustry(page, gate.ask)).toBeNull();
	});

	it("keeps the free text answer when the label is a guess", async () => {
		const gate = answering(FREIGHT, WEBSITE.industry.threshold - 0.01);

		expect(await askIndustry(page, gate.ask)).toBeNull();
	});

	it("takes the label at the threshold", async () => {
		const gate = answering(FREIGHT, WEBSITE.industry.threshold);

		expect(await askIndustry(page, gate.ask)).toBe(FREIGHT);
	});

	it("keeps the free text answer when Jev fails", async () => {
		const gate = failing();

		expect(await askIndustry(page, gate.ask)).toBeNull();
		expect(gate.sent).toHaveLength(1);
	});
});

describe("an answer outside the list is not readable", () => {
	it("answers nothing when Jev names a label nobody offered", async () => {
		const answer = await askChoice(
			KEY,
			{ page: "x" },
			WEBSITE.industry.question,
			question,
			Object.keys(WEBSITE.industry.options),
			{
				fetchImpl: (async () =>
					Response.json({
						answers: {
							[WEBSITE.industry.question]: {
								type: "choice",
								choice: "Palettenhandel",
								confidence: 1,
								probabilities: { Palettenhandel: 1 },
							},
						},
					})) as unknown as typeof fetch,
			},
		);

		expect(answer).toBeNull();
	});

	it("reads an answer that names a label from the list", async () => {
		const answer = await askChoice(
			KEY,
			{ page: "x" },
			WEBSITE.industry.question,
			question,
			Object.keys(WEBSITE.industry.options),
			{
				fetchImpl: (async () =>
					Response.json({
						answers: {
							[WEBSITE.industry.question]: {
								type: "choice",
								choice: FREIGHT,
								confidence: 0.8,
								probabilities: { [FREIGHT]: 0.8 },
							},
						},
					})) as unknown as typeof fetch,
			},
		);

		expect(answer?.choice).toBe(FREIGHT);
		expect(answer?.probabilities[FREIGHT]).toBe(0.8);
	});
});
