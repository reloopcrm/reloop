import { describe, expect, it } from "bun:test";
import { PAID_PLAN_IDS } from "@crm/db/pricing";
import { PRICING } from "../components/landing/pricing/config";
import { pricingPlans } from "../components/landing/pricing/plans";
import { purchaseFromParams } from "../components/landing/pricing/purchase";

const plans = pricingPlans();
const planOf = (id: string) => {
	const plan = plans.find((candidate) => candidate.id === id);
	if (!plan) throw new Error(`no plan ${id}`);
	return plan;
};

describe("the buy buttons on the pricing page", () => {
	it("keeps every trial link exactly as before", () => {
		for (const id of PAID_PLAN_IDS) {
			expect(planOf(id).href).toBe(
				`${PRICING.href.start}?${PRICING.href.planParam}=${id}`,
			);
		}
	});

	it("carries plan, interval and the buy intent into the sign-up", () => {
		expect(planOf("team").buyHref.year).toBe(
			`${PRICING.href.start}?plan=team&interval=year&buy=1`,
		);
		expect(planOf("start").buyHref.month).toBe(
			`${PRICING.href.start}?plan=start&interval=month&buy=1`,
		);
	});

	it("puts the trial first on Start and Standard only", () => {
		const trialFirst = plans
			.filter((plan) => plan.trialFirst)
			.map((plan) => plan.id);
		expect(trialFirst).toEqual(["start", "standard"]);
	});
});

describe("the purchase in the sign-up URL", () => {
	it("reads a paid plan with its interval", () => {
		expect(
			purchaseFromParams({ plan: "team", interval: "year", buy: "1" }),
		).toEqual({ plan: "team", interval: "year" });
	});

	it("is nothing without the buy intent", () => {
		expect(purchaseFromParams({ plan: "team", interval: "year" })).toBeNull();
		expect(purchaseFromParams({ plan: "team" })).toBeNull();
	});

	it("rejects the trial, an unknown plan and an unknown interval", () => {
		expect(
			purchaseFromParams({ plan: "trial", interval: "month", buy: "1" }),
		).toBeNull();
		expect(
			purchaseFromParams({ plan: "gold", interval: "month", buy: "1" }),
		).toBeNull();
		expect(
			purchaseFromParams({ plan: "team", interval: "week", buy: "1" }),
		).toBeNull();
		expect(
			purchaseFromParams({
				plan: ["team", "start"],
				interval: "month",
				buy: "1",
			}),
		).toBeNull();
	});
});
