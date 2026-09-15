import { describe, expect, it } from "bun:test";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import { z } from "zod";
import {
	alreadyTuned,
	BUSINESS_SETUP,
	businessProposal,
	mergeBusiness,
	setupSource,
} from "../agent/lib/business-setup";

describe("deciding whether the business rules still need finding", () => {
	it("sees the untouched default as not yet set", () => {
		expect(alreadyTuned(DEFAULT_WIN_BACK_RULES.business.description)).toBe(
			false,
		);
	});

	it("ignores padding around the default", () => {
		expect(
			alreadyTuned(`  ${DEFAULT_WIN_BACK_RULES.business.description}  `),
		).toBe(false);
	});

	it("sees anything a customer would have as set", () => {
		for (const description of [
			"Wir handeln mit Baustahl und Betonmatten.",
			"We buy and sell used forklifts.",
			"Wir kaufen und verkaufen Europaletten.",
		]) {
			expect(alreadyTuned(description)).toBe(true);
		}
	});
});

describe("reading a proposal for any business", () => {
	it("accepts a software agency", () => {
		const parsed = businessProposal.safeParse({
			description: "We build web and mobile apps for mid sized companies.",
			products: ["web app", "mobile app", "web app"],
			sideProducts: ["hosting"],
			boxProducts: [],
			minPallets: 1,
			minBoxes: 0,
			unit: "projects",
			note: "Read from the services page.",
		});

		expect(parsed.success).toBe(true);
		expect(parsed.data?.products).toEqual(["web app", "mobile app"]);
		expect(parsed.data?.unit).toBe("projects");
	});

	it("refuses a proposal without a description", () => {
		expect(
			businessProposal.safeParse({
				description: "  ",
				products: ["consulting"],
				sideProducts: [],
				boxProducts: [],
				minPallets: 0,
				minBoxes: 0,
				unit: "projects",
				note: "Nothing.",
			}).success,
		).toBe(false);
	});
});

describe("the schema the prompt shows the model", () => {
	it("builds from the proposal shape, transforms and all", () => {
		const json = z.toJSONSchema(businessProposal, { io: "input" }) as {
			properties: Record<string, { type?: string }>;
		};

		expect(json.properties.description?.type).toBe("string");
		expect(json.properties.products?.type).toBe("array");
		expect(json.properties.minPallets?.type).toBe("integer");
	});
});

describe("the setup limits", () => {
	it("waits for enough mail before it guesses", () => {
		expect(BUSINESS_SETUP.minThreads).toBeGreaterThanOrEqual(10);
		expect(BUSINESS_SETUP.threadSample).toBeGreaterThanOrEqual(
			BUSINESS_SETUP.minThreads,
		);
	});

	it("keeps the sample small enough to stay cheap", () => {
		const chars = BUSINESS_SETUP.threadSample * BUSINESS_SETUP.bodyChars;
		expect(chars).toBeLessThanOrEqual(40_000);
	});
});

const proposal = {
	description: "We build web apps.",
	products: ["Web app", "Mobile app"],
	sideProducts: ["Hosting", "web app"],
	boxProducts: [],
	minPallets: 2,
	minBoxes: 0,
	unit: "projects",
};

const set = {
	...DEFAULT_WIN_BACK_RULES.business,
	description: "We sell design work.",
	products: ["web app", "Logo"],
	sideProducts: ["Print"],
	minPallets: 5,
	unit: "orders",
};

describe("learning the business from mail after onboarding", () => {
	it("adds missing products and side products", () => {
		const merged = mergeBusiness(set, proposal, true);

		expect(merged.products).toEqual(["web app", "Logo", "Mobile app"]);
		expect(merged.sideProducts).toEqual(["Print", "Hosting"]);
	});

	it("never overwrites a value that is set", () => {
		const merged = mergeBusiness(set, proposal, true);

		expect(merged.description).toBe("We sell design work.");
		expect(merged.minPallets).toBe(5);
		expect(merged.unit).toBe("orders");
		expect(merged.products.slice(0, 2)).toEqual(set.products);
		expect(merged.sideProducts[0]).toBe("Print");
	});

	it("fills a minimum and unit that are still the default", () => {
		const merged = mergeBusiness(
			{ ...set, minPallets: 0, unit: "units" },
			proposal,
			true,
		);

		expect(merged.minPallets).toBe(2);
		expect(merged.unit).toBe("projects");
	});

	it("runs the mail pass only once", () => {
		const enough = BUSINESS_SETUP.minThreads;

		expect(setupSource(set, enough)).toBe("mail");
		const learned = mergeBusiness(set, proposal, true);
		expect(learned.learnedFromMail).toBe(true);
		expect(setupSource(learned, enough)).toBeNull();
	});

	it("reads the website only while nothing is set and mail is thin", () => {
		expect(setupSource(DEFAULT_WIN_BACK_RULES.business, 0)).toBe("website");
		expect(setupSource(set, 0)).toBeNull();
		expect(
			mergeBusiness(DEFAULT_WIN_BACK_RULES.business, proposal, false)
				.learnedFromMail,
		).toBe(false);
	});
});
