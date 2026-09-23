import { describe, expect, it } from "bun:test";
import { answerSteps, pickPlan } from "../components/landing/pricing/pick-plan";
import { pricingPlans } from "../components/landing/pricing/plans";

const plans = pricingPlans();
const steps = answerSteps(plans);

const pick = (mailboxes: number, conversations: number, ownKey: boolean) =>
	pickPlan(plans, { mailboxes, conversations, ownKey });

describe("the plan picker", () => {
	it("asks for the real mailbox and conversation steps of the plans", () => {
		expect(steps.mailboxes).toEqual([1, 2, 4, 8]);
		expect(steps.conversations).toEqual([1_000, 3_000, 7_000, 18_000, 45_000]);
	});

	it("gives the smallest included plan that covers both amounts", () => {
		expect(pick(1, 1_000, false).plan.id).toBe("start");
		expect(pick(1, 3_000, false).plan.id).toBe("standard");
		expect(pick(2, 1_000, false).plan.id).toBe("plus");
		expect(pick(1, 18_000, false).plan.id).toBe("team");
		expect(pick(8, 1_000, false).plan.id).toBe("office");
		expect(pick(4, 45_000, false).plan.id).toBe("office");
	});

	it("gives Hosting or Hosting Pro for an own key, whatever the mail amount", () => {
		expect(pick(1, 45_000, true).plan.id).toBe("hosting");
		expect(pick(2, 1_000, true).plan.id).toBe("hosting");
		expect(pick(4, 1_000, true).plan.id).toBe("hosting-pro");
	});

	it("adds extra mailboxes when no own key plan reads enough of them", () => {
		expect(pick(8, 1_000, true)).toMatchObject({
			plan: { id: "hosting-pro" },
			extraMailboxes: 2,
		});
	});

	it("gives a real plan for every combination of answers", () => {
		for (const mailboxes of steps.mailboxes)
			for (const conversations of steps.conversations)
				for (const ownKey of [false, true]) {
					const { plan, extraMailboxes } = pick(
						mailboxes,
						conversations,
						ownKey,
					);
					expect(plan.aiIncluded).toBe(!ownKey);
					expect(plan.mailboxes + extraMailboxes).toBeGreaterThanOrEqual(
						mailboxes,
					);
					if (!ownKey) {
						expect(extraMailboxes).toBe(0);
						expect(plan.conversations ?? 0).toBeGreaterThanOrEqual(
							conversations,
						);
					}
				}
	});
});
