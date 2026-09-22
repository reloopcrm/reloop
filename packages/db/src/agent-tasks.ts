export const TASK_KINDS = [
	"brand",
	"portrait",
	"meeting-prep",
	"identify",
	"profile",
	"recheck",
	"company-profile",
	"workspace-profile",
	"field-backfill",
	"slack-people-match",
	"slack-channel-join",
	"agent-event",
	"webhook-delivery",
	"thread-insight",
	"thread-digest",
	"rules-tune",
	"business-setup",
	"usage-probe",
	"contact-clean",
	"playbook-learn",
	"email-draft",
	"field-proposal",
	"deal-stall",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export const USAGE_PROBE_KIND = "usage-probe" satisfies TaskKind;

export const USAGE_PROBE_OUTCOMES = {
	refreshed: "Usage limit refreshed.",
	noLimit:
		"The subscription answered without a usage limit. The reading stays as it was.",
	wrongProvider: "Only the ChatGPT subscription reports a usage limit.",
	notSetUp: "The ChatGPT subscription is not set up.",
} as const;

export const DIRECT_KINDS = [
	"brand",
	"portrait",
	"slack-people-match",
	"slack-channel-join",
	"agent-event",
	"webhook-delivery",
	"thread-insight",
	"thread-digest",
	"rules-tune",
	"business-setup",
	"usage-probe",
	"contact-clean",
	"playbook-learn",
	"email-draft",
	"field-proposal",
	"deal-stall",
] as const;

export type DirectKind = (typeof DIRECT_KINDS)[number];

export function isDirectKind(kind: string): kind is DirectKind {
	return (DIRECT_KINDS as readonly string[]).includes(kind);
}

export const PERSON_DECIDES_KINDS = ["field-proposal"] as const;

export function waitsForPerson(kind: string): boolean {
	return (PERSON_DECIDES_KINDS as readonly string[]).includes(kind);
}

export const CONTACT_STATUS_KINDS = ["identify", "profile", "recheck"] as const;

export const COMPANY_STATUS_KINDS = ["brand"] as const;

export function ownsContactStatus(kind: string): boolean {
	return (CONTACT_STATUS_KINDS as readonly string[]).includes(kind);
}

export function ownsCompanyStatus(kind: string): boolean {
	return (COMPANY_STATUS_KINDS as readonly string[]).includes(kind);
}

export const COMPANY_PROFILE_BUDGET = 1;

export const MAX_ATTEMPTS = 3;

export const RETIRED_OUTCOME = `Gave up after ${MAX_ATTEMPTS} attempts: the session never reported back.`;

export const PRIORITY = {
	brand: 900,
	portrait: 800,
	workspace: 500,
	requested: 300,
	meeting: 200,
	identify: 100,
	sweep: 50,
	companyProfile: 40,
	fieldBackfill: 20,
	recheck: 0,
	slackPeople: 150,
	slackJoin: 950,
	threadInsight: 700,
	threadInsightBackfill: 10,
	threadDigest: 760,
	rulesTune: 650,
	usageProbe: 990,
	businessSetup: 985,
	contactClean: 720,
	emailDraft: 970,
	playbookLearn: 600,
	event: 700,
	dealStall: 30,
} as const;
