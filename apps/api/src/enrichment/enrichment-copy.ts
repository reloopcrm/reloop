import { MAX_ATTEMPTS, type TaskKind } from "@crm/db/agent-tasks";

export type EnrichmentQueueState = "running" | "queued" | "failed";

const STEPS = {
	brand: "Fetching the logo",
	portrait: "Finding their photo",
	"meeting-prep": "Getting ready for your meeting",
	identify: "Reading their profile",
	profile: "Reading their profile",
	recheck: "Checking for anything new",
	"company-profile": "Reading the company website",
	"workspace-profile": "Reading your own website",
	"field-backfill": "Filling in the blank details",
	"slack-people-match": "Matching people in Slack",
	"slack-channel-join": "Joining a Slack channel",
	"agent-event": "Reacting to a change",
	"thread-insight": "Reading the conversation",
	"thread-digest": "Summarising every message",
	"email-draft": "Writing an email draft",
	"business-setup": "Working out what you trade",
	"rules-tune": "Tuning the win-back rules",
	"usage-probe": "Reading the subscription limit",
	"contact-clean": "Reading their signature",
	"playbook-learn": "Learning from your replies",
	"field-proposal": "Waiting for you to accept a field",
} satisfies Record<TaskKind, string>;

const STEP_BY_KIND = new Map<string, string>(Object.entries(STEPS));

const UNKNOWN_STEP = "Looking them up";
const WAITING = "Waiting";
const GAVE_UP = "Could not look this up";

const SECOND_MS = 1_000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;
const DAYS_IN_WEEK = 7;
const DAYS_IN_MONTH = 30;
const WEEKS_FROM = 14;
const MONTHS_FROM = 60;

const TODAY = "Later today";
const TOMORROW = "Tomorrow";

export function enrichmentStep(kind: string): string {
	return STEP_BY_KIND.get(kind) ?? UNKNOWN_STEP;
}

export function enrichmentQueueState(
	attempts: number,
	leasedUntil: Date | null,
	now: Date,
): EnrichmentQueueState {
	if (leasedUntil !== null && leasedUntil.getTime() > now.getTime()) {
		return "running";
	}

	return attempts >= MAX_ATTEMPTS ? "failed" : "queued";
}

export function enrichmentQueueLine(
	state: EnrichmentQueueState,
	kind: string,
): string {
	if (state === "queued") return WAITING;
	if (state === "failed") return GAVE_UP;

	return enrichmentStep(kind);
}

export type EnrichmentDue = { text: string; count: number | null };

export function enrichmentDueLabel(dueAt: Date, now: Date): EnrichmentDue {
	const ahead = dueAt.getTime() - now.getTime();
	if (ahead < DAY_MS) return { text: TODAY, count: null };

	const days = Math.floor(ahead / DAY_MS);
	if (days === 1) return { text: TOMORROW, count: null };
	if (days < WEEKS_FROM) return { text: "In {count} days", count: days };
	if (days < MONTHS_FROM) {
		return { text: "In {count} weeks", count: Math.round(days / DAYS_IN_WEEK) };
	}

	return { text: "In {count} months", count: Math.round(days / DAYS_IN_MONTH) };
}
