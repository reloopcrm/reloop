export type PricingPlan = {
	id: string;
	name: string;
	tagline: string;
	href: string;
	monthly: number;
	yearly: number;
	aiIncluded: boolean;
	popular: boolean;
	mailboxes: number;
	conversations: number | null;
	drafts: number | null;
	research: number | null;
	companyResearch: boolean;
	contacts: number;
	storageGb: number | null;
	support: string | null;
};

export type PlanAnswers = {
	mailboxes: number;
	conversations: number;
	ownKey: boolean;
};

export type PlanChoice = { plan: PricingPlan; extraMailboxes: number };

export type LimitValue =
	| { count: number }
	| { gigabytes: number }
	| { text: string };

export type LimitRow = { label: string; value: LimitValue };

const UNLIMITED: LimitValue = { text: "Unlimited" };

function amount(value: number | null): LimitValue {
	return value === null ? UNLIMITED : { count: value };
}

export function familyOf(
	plans: readonly PricingPlan[],
	ownKey: boolean,
): PricingPlan[] {
	return plans
		.filter((plan) => plan.aiIncluded !== ownKey)
		.sort((a, b) => a.monthly - b.monthly);
}

export function pickPlan(
	plans: readonly PricingPlan[],
	answers: PlanAnswers,
): PlanChoice {
	const family = familyOf(plans, answers.ownKey);
	const plan =
		family.find(
			(candidate) =>
				candidate.mailboxes >= answers.mailboxes &&
				(candidate.conversations === null ||
					candidate.conversations >= answers.conversations),
		) ?? family.at(-1);
	if (!plan) throw new Error("The price list holds no plan for this answer.");

	return {
		plan,
		extraMailboxes: Math.max(0, answers.mailboxes - plan.mailboxes),
	};
}

export function answerSteps(plans: readonly PricingPlan[]) {
	const included = familyOf(plans, false);
	const unique = (values: number[]) =>
		[...new Set(values)].sort((a, b) => a - b);

	return {
		mailboxes: unique(included.map((plan) => plan.mailboxes)),
		conversations: unique(
			included.flatMap((plan) =>
				plan.conversations === null ? [] : [plan.conversations],
			),
		),
	};
}

export function limitRows(plan: PricingPlan): LimitRow[] {
	const rows: LimitRow[] = [
		{ label: "Mailboxes", value: { count: plan.mailboxes } },
		{
			label: "Mail conversations per month",
			value: amount(plan.conversations),
		},
		{ label: "Mail drafts per month", value: amount(plan.drafts) },
		{
			label: "Company research per month",
			value: plan.companyResearch
				? amount(plan.research)
				: { text: "Not included" },
		},
		{ label: "Contacts", value: { count: plan.contacts } },
	];
	if (plan.storageGb !== null)
		rows.push({ label: "Storage", value: { gigabytes: plan.storageGb } });
	rows.push({ label: "Seats", value: UNLIMITED });
	if (plan.support !== null)
		rows.push({ label: "Support", value: { text: plan.support } });

	return rows;
}

export function limitText(
	value: LimitValue,
	t: (text: string, vars?: Record<string, string | number>) => string,
	format: Intl.NumberFormat,
): string {
	if ("count" in value) return format.format(value.count);
	if ("gigabytes" in value) return t("{count} GB", { count: value.gigabytes });
	return t(value.text);
}
