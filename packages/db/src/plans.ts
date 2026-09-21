import { isHosted } from "./tenant-context";

export const CONTACT_LIMIT_MESSAGE =
	"The contact limit is reached. Ask the server operator to change your plan.";

export const PLAN_IDS = [
	"trial",
	"start",
	"standard",
	"plus",
	"team",
	"office",
	"hosting",
	"hosting-pro",
] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export const LEGACY_PLAN_IDS = {
	test: "trial",
	handel: "standard",
	"handel-plus": "team",
} as const satisfies Record<string, PlanId>;

export type PlanLimits = {
	label: string;
	contacts: number | null;
	mailboxes: number | null;
	importMonths: number | null;
	importThreads: number | null;
	researchPerHour: number | null;
	companyResearch: boolean;
	insightsPerMonth: number | null;
	draftsPerMonth: number | null;
	researchPerMonth: number | null;
	chatPerMonth: number | null;
	builderPerMonth: number | null;
	storageGb: number | null;
	aiIncluded: boolean;
};

export const NO_PLAN: PlanLimits = {
	label: "No limit",
	contacts: null,
	mailboxes: null,
	importMonths: null,
	importThreads: null,
	researchPerHour: null,
	companyResearch: true,
	insightsPerMonth: null,
	draftsPerMonth: null,
	researchPerMonth: null,
	chatPerMonth: null,
	builderPerMonth: null,
	storageGb: null,
	aiIncluded: false,
};

export const TRIAL_DAYS = 14;

export const PLANS = {
	trial: {
		label: "Trial",
		contacts: 2_000,
		mailboxes: 1,
		importMonths: 3,
		importThreads: 500,
		researchPerHour: 5,
		companyResearch: false,
		insightsPerMonth: 1_000,
		draftsPerMonth: 40,
		researchPerMonth: 0,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: null,
		aiIncluded: true,
	},
	start: {
		label: "Start",
		contacts: 10_000,
		mailboxes: 1,
		importMonths: null,
		importThreads: null,
		researchPerHour: 10,
		companyResearch: true,
		insightsPerMonth: 1_000,
		draftsPerMonth: 40,
		researchPerMonth: null,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: null,
		aiIncluded: true,
	},
	standard: {
		label: "Standard",
		contacts: 25_000,
		mailboxes: 1,
		importMonths: null,
		importThreads: null,
		researchPerHour: 30,
		companyResearch: true,
		insightsPerMonth: 3_000,
		draftsPerMonth: 100,
		researchPerMonth: null,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: null,
		aiIncluded: true,
	},
	plus: {
		label: "Plus",
		contacts: 50_000,
		mailboxes: 2,
		importMonths: null,
		importThreads: null,
		researchPerHour: 30,
		companyResearch: true,
		insightsPerMonth: 7_000,
		draftsPerMonth: 300,
		researchPerMonth: null,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: null,
		aiIncluded: true,
	},
	team: {
		label: "Team",
		contacts: 150_000,
		mailboxes: 4,
		importMonths: null,
		importThreads: null,
		researchPerHour: 60,
		companyResearch: true,
		insightsPerMonth: 18_000,
		draftsPerMonth: 800,
		researchPerMonth: null,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: null,
		aiIncluded: true,
	},
	office: {
		label: "Office",
		contacts: 500_000,
		mailboxes: 8,
		importMonths: null,
		importThreads: null,
		researchPerHour: 60,
		companyResearch: true,
		insightsPerMonth: 45_000,
		draftsPerMonth: 2_000,
		researchPerMonth: null,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: null,
		aiIncluded: true,
	},
	hosting: {
		label: "Hosting",
		contacts: 10_000,
		mailboxes: 2,
		importMonths: null,
		importThreads: null,
		researchPerHour: null,
		companyResearch: true,
		insightsPerMonth: null,
		draftsPerMonth: null,
		researchPerMonth: null,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: 5,
		aiIncluded: false,
	},
	"hosting-pro": {
		label: "Hosting Pro",
		contacts: 50_000,
		mailboxes: 6,
		importMonths: null,
		importThreads: null,
		researchPerHour: null,
		companyResearch: true,
		insightsPerMonth: null,
		draftsPerMonth: null,
		researchPerMonth: null,
		chatPerMonth: null,
		builderPerMonth: null,
		storageGb: 25,
		aiIncluded: false,
	},
} as const satisfies Record<PlanId, PlanLimits>;

export const INSIGHT_KIND = "thread-insight";

export const DRAFT_KIND = "email-draft";

export const RESEARCH_RUN_KIND = "company-profile";

export const COMPANY_RESEARCH_KINDS = [
	"brand",
	"company-profile",
	"portrait",
] as const;

export function isPlanId(value: string | null | undefined): value is PlanId {
	return (PLAN_IDS as readonly string[]).includes(value ?? "");
}

export function canonicalPlanId(
	value: string | null | undefined,
): PlanId | null {
	if (isPlanId(value)) return value;

	return value !== null && value !== undefined && value in LEGACY_PLAN_IDS
		? LEGACY_PLAN_IDS[value as keyof typeof LEGACY_PLAN_IDS]
		: null;
}

export function limitsOf(plan: string | null | undefined): PlanLimits {
	if (plan === null || plan === undefined || plan === "") return NO_PLAN;

	return PLANS[canonicalPlanId(plan) ?? "trial"];
}

export function startOfMonth(now = new Date()): Date {
	const month = new Date(now);
	month.setUTCDate(1);
	month.setUTCHours(0, 0, 0, 0);
	return month;
}

export function monthlyBudget(kind: string, limits: PlanLimits): number | null {
	if (kind === INSIGHT_KIND) return limits.insightsPerMonth;
	if (kind === DRAFT_KIND) return limits.draftsPerMonth;
	if (kind === RESEARCH_RUN_KIND) return limits.researchPerMonth;

	return null;
}

export function monthStart(now: Date = new Date()): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStart(now: Date = new Date()): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function fixedAiFor(plan: string | null | undefined): boolean {
	return isHosted() && limitsOf(plan).aiIncluded;
}

export const LIMIT_REACHED_MESSAGE =
	"The monthly limit of your plan is reached. This work continues next month. Upgrade your plan to continue now.";

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
