export const INSIGHT_OUTCOMES = [
	"DEAL_DONE",
	"OPEN_INQUIRY_THEIRS",
	"OPEN_OFFER_OURS",
	"QUOTED",
	"DECLINED",
	"OTHER",
] as const;

export type InsightOutcome = (typeof INSIGHT_OUTCOMES)[number];

export const DECLINED_OUTCOME = "DECLINED" satisfies InsightOutcome;

export const DECLINE_KIND = {
	hard: "HARD",
	soft: "SOFT",
} as const;

export const DECLINE_KINDS = [DECLINE_KIND.hard, DECLINE_KIND.soft] as const;

export type DeclineKind = (typeof DECLINE_KINDS)[number];

export const INSIGHT_SIDES = [
	"THEY_BUY",
	"THEY_SELL",
	"BOTH",
	"UNCLEAR",
] as const;

export type InsightSide = (typeof INSIGHT_SIDES)[number];

export const THREAD_CLASSIFICATION = {
	none: "NONE",
	pending: "PENDING",
	relevant: "RELEVANT",
	irrelevant: "IRRELEVANT",
	unplaced: "UNPLACED",
} as const;

export const POTENTIAL_VERDICT = {
	good: "good",
	bad: "bad",
	later: "later",
} as const;

export const POTENTIAL_VERDICTS = [
	POTENTIAL_VERDICT.good,
	POTENTIAL_VERDICT.bad,
	POTENTIAL_VERDICT.later,
] as const;

export type PotentialVerdict =
	(typeof POTENTIAL_VERDICT)[keyof typeof POTENTIAL_VERDICT];

export const MEMORY = {
	summaryMaxChars: 1_200,
	briefMaxChars: 280,
	threadSummaryMaxChars: 400,
	messageSummaryMaxChars: 200,
	evidenceQuoteMaxChars: 200,
	messagesPerThread: 12,
	linkedContactsPerThread: 5,
	bodyMaxChars: 1_500,
	jsonAttempts: 2,
	callTimeoutMs: 90_000,
} as const;
