export const CONTACT_LIMIT_MESSAGE =
	"The contact limit is reached. Ask the server operator to change your plan.";

export type PlanLimits = {
	label: string;
	contacts: number | null;
	mailboxes: number | null;
	importMonths: number | null;
	importThreads: number | null;
	researchPerHour: number | null;
	researchSessionsPerMonth: number | null;
	companyResearch: boolean;
	insightsPerMonth: number | null;
	draftsPerMonth: number | null;
	researchPerMonth: number | null;
	chatPerMonth: number | null;
	builderPerMonth: number | null;
	storageGb: number | null;
	aiIncluded: boolean;
	sharedKeyShare: number | null;
};

export const NO_PLAN: PlanLimits = {
	label: "No limit",
	contacts: null,
	mailboxes: null,
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
	storageGb: null,
	aiIncluded: false,
	sharedKeyShare: null,
};

export const DAY_MS = 24 * 60 * 60 * 1_000;

export const INSIGHT_KIND = "thread-insight";

export const DRAFT_KIND = "email-draft";

export const STORY_KIND = "person-story";

const SHARED_BUDGETS: readonly (readonly string[])[] = [
	[INSIGHT_KIND, STORY_KIND],
];

export function budgetKinds(kind: string): string[] {
	return [...(SHARED_BUDGETS.find((kinds) => kinds.includes(kind)) ?? [kind])];
}

export const RESEARCH_RUN_KIND = "company-profile";

export const COMPANY_RESEARCH_KINDS = [
	"brand",
	"company-profile",
	"portrait",
] as const;

export const CAPACITY_COUNTERS = ["contacts", "mailboxes"] as const;

export type CapacityCounter = (typeof CAPACITY_COUNTERS)[number];

export type CapacityUsage = Record<CapacityCounter, number>;

export type CapacityExcess = {
	counter: CapacityCounter;
	used: number;
	limit: number;
};

export function capacityExcess(
	usage: CapacityUsage,
	limits: PlanLimits,
): CapacityExcess[] {
	return CAPACITY_COUNTERS.flatMap((counter) => {
		const limit = limits[counter];
		const used = usage[counter];
		return limit !== null && used > limit ? [{ counter, used, limit }] : [];
	});
}

export function startOfMonth(now = new Date()): Date {
	const month = new Date(now);
	month.setUTCDate(1);
	month.setUTCHours(0, 0, 0, 0);
	return month;
}

export function monthlyBudget(kind: string, limits: PlanLimits): number | null {
	if (kind === INSIGHT_KIND || kind === STORY_KIND) {
		return limits.insightsPerMonth;
	}
	if (kind === DRAFT_KIND) return limits.draftsPerMonth;
	if (kind === RESEARCH_RUN_KIND) return limits.researchPerMonth;

	return null;
}

export const PLAN_RESERVE = { insightForwardShare: 0.2 } as const;

export function forwardReserve(kind: string, limits: PlanLimits): number {
	const budget = monthlyBudget(kind, limits);
	if (budget === null || !budgetKinds(INSIGHT_KIND).includes(kind)) return 0;

	return Math.ceil(budget * PLAN_RESERVE.insightForwardShare);
}

export function keepsReserve(kind: string, origin: string): boolean {
	return kind === STORY_KIND || origin === "backfill";
}

export function nextMonthStart(now: Date = new Date()): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
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
