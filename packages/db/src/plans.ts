export const CONTACT_LIMIT_MESSAGE =
	"The contact limit is reached. Ask the server operator to change your plan.";

export const PLAN_IDS = ["test", "handel", "handel-plus"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
	label: string;
	contacts: number | null;
	mailboxes: number | null;
	importMonths: number | null;
	researchPerHour: number | null;
	companyResearch: boolean;
	insightsPerMonth: number | null;
};

export const NO_PLAN: PlanLimits = {
	label: "Ohne Grenze",
	contacts: null,
	mailboxes: null,
	importMonths: null,
	researchPerHour: null,
	companyResearch: true,
	insightsPerMonth: null,
};

export const PLANS = {
	test: {
		label: "Test",
		contacts: 2_000,
		mailboxes: 1,
		importMonths: 6,
		researchPerHour: 5,
		companyResearch: false,
		insightsPerMonth: 300,
	},
	handel: {
		label: "Handel",
		contacts: 10_000,
		mailboxes: 3,
		importMonths: 24,
		researchPerHour: 30,
		companyResearch: true,
		insightsPerMonth: 5_000,
	},
	"handel-plus": {
		label: "Handel Plus",
		contacts: null,
		mailboxes: null,
		importMonths: 60,
		researchPerHour: 60,
		companyResearch: true,
		insightsPerMonth: null,
	},
} as const satisfies Record<PlanId, PlanLimits>;

export const INSIGHT_KIND = "thread-insight";

export const COMPANY_RESEARCH_KINDS = [
	"brand",
	"company-profile",
	"portrait",
] as const;

export function isPlanId(value: string | null | undefined): value is PlanId {
	return (PLAN_IDS as readonly string[]).includes(value ?? "");
}

export function limitsOf(plan: string | null | undefined): PlanLimits {
	return plan === null || plan === undefined || plan === ""
		? NO_PLAN
		: isPlanId(plan)
			? PLANS[plan]
			: PLANS.test;
}

export function importSinceFloor(limits: PlanLimits, now: Date): Date | null {
	if (limits.importMonths === null) return null;

	const floor = new Date(now);
	floor.setMonth(floor.getMonth() - limits.importMonths);

	return floor;
}

export function clampImportSince(
	wanted: Date | null,
	limits: PlanLimits,
	now: Date,
): Date | null {
	const floor = importSinceFloor(limits, now);
	if (!floor) return wanted;
	if (!wanted) return floor;

	return wanted.getTime() < floor.getTime() ? floor : wanted;
}

export function clampResearchPerHour(
	wanted: number | null,
	limits: PlanLimits,
): number | null {
	if (limits.researchPerHour === null) return wanted;
	if (wanted === null) return limits.researchPerHour;

	return Math.min(wanted, limits.researchPerHour);
}

export function allowsCompanyResearch(
	kind: string,
	limits: PlanLimits,
): boolean {
	if (limits.companyResearch) return true;

	return !(COMPANY_RESEARCH_KINDS as readonly string[]).includes(kind);
}
