import type { CloudPlans } from "./cloud/contract";
import { cloud } from "./cloud/scope";
import { NO_PLAN, type PlanLimits } from "./plans";

export const TEST_PLANS = {
	small: {
		label: "Small",
		contacts: 2_000,
		mailboxes: 1,
		importMonths: 3,
		importThreads: 500,
		researchPerHour: 5,
		researchSessionsPerMonth: 100,
		companyResearch: false,
		insightsPerMonth: 500,
		draftsPerMonth: 20,
		researchPerMonth: null,
		chatPerMonth: 200,
		builderPerMonth: 100,
		storageGb: null,
		aiIncluded: true,
		sharedKeyShare: 0.05,
	},
	wide: {
		label: "Wide",
		contacts: 50_000,
		mailboxes: 2,
		importMonths: null,
		importThreads: null,
		researchPerHour: 30,
		researchSessionsPerMonth: 600,
		companyResearch: true,
		insightsPerMonth: 7_000,
		draftsPerMonth: 300,
		researchPerMonth: 300,
		chatPerMonth: 3_000,
		builderPerMonth: 1_000,
		storageGb: null,
		aiIncluded: true,
		sharedKeyShare: 0.3,
	},
	keyless: {
		label: "Keyless",
		contacts: 10_000,
		mailboxes: 2,
		importMonths: null,
		importThreads: null,
		researchPerHour: null,
		researchSessionsPerMonth: null,
		companyResearch: true,
		insightsPerMonth: null,
		draftsPerMonth: null,
		researchPerMonth: null,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: 5,
		aiIncluded: false,
		sharedKeyShare: null,
	},
} as const satisfies Record<string, PlanLimits>;

export type TestPlanId = keyof typeof TEST_PLANS;

export const TEST_PLAN_IDS = Object.keys(TEST_PLANS) as TestPlanId[];

export function isTestPlanId(
	value: string | null | undefined,
): value is TestPlanId {
	return value !== null && value !== undefined && value in TEST_PLANS;
}

export const testPlans: CloudPlans = {
	limitsOf: (plan) => (isTestPlanId(plan) ? TEST_PLANS[plan] : NO_PLAN),
	withAddOns: (limits) => limits,
	usageWindow: () => null,
	isTrial: () => false,
	options: () =>
		TEST_PLAN_IDS.map((id) => ({ id, label: TEST_PLANS[id].label })),
};

const selfHosted = cloud.plans;

export function actWithTestPlans(): void {
	Object.assign(cloud, { plans: testPlans });
}

export function actWithoutPlans(): void {
	Object.assign(cloud, { plans: selfHosted });
}
