import { REACTIVATION } from "@crm/db/reactivation";
import { winBackRules } from "@crm/validation/win-back-rules";
import { z } from "zod";

export const winBackRulesOutput = winBackRules;
export const setWinBackRulesInput = z.object({
	rules: winBackRules,
	keepMode: z.boolean().default(false),
});

export const winBackBand = z.enum(["high", "medium", "low"]);

export const reactivationListInput = z.object({
	rejected: z.boolean().default(false),
	quietForDays: z
		.number()
		.int()
		.min(REACTIVATION.quietForDays.min)
		.max(REACTIVATION.quietForDays.max)
		.default(REACTIVATION.quietForDays.default),
	scope: z.enum(["me", "everyone"]).default("everyone"),
	q: z.string().trim().max(200).default(""),
	sort: z.string().trim().max(40).default(""),
	dir: z.enum(["asc", "desc"]).default("desc"),
	page: z.number().int().min(1).max(10_000).default(1),
	pageSize: z.number().int().min(1).max(200).default(25),
	potential: z.array(winBackBand).default([]),
});

export const winBackFactsOutput = z.object({
	summary: z.string().nullable(),
	didBusiness: z.number(),
	openInquiries: z.number(),
	maxPallets: z.number().nullable(),
	products: z.array(z.string()),
	threadsRead: z.number(),
});

export const winBackPersonOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	title: z.string().nullable(),
	imageUrl: z.string().nullable(),
	potential: winBackBand,
	standing: z.string().nullable(),
	lastContactAt: z.string(),
	quietDays: z.number(),
	waitingOnUs: z.boolean(),
	feedback: z.string().nullable(),
	memory: winBackFactsOutput,
});

export const winBackGroupOutput = z.object({
	key: z.string(),
	name: z.string(),
	company: z.object({ id: z.string(), name: z.string() }).nullable(),
	people: z.array(winBackPersonOutput),
	potential: winBackBand,
	standing: z.string().nullable(),
	lastContactAt: z.string(),
	quietDays: z.number(),
	waitingOnUs: z.boolean(),
	feedback: z.string().nullable(),
	memory: winBackFactsOutput,
});

export const reactivationListOutput = z.object({
	rows: z.array(winBackGroupOutput),
	total: z.number(),
	people: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
	truncated: z.boolean(),
	quietForDays: z.number(),
	generatedAt: z.string(),
	rules: winBackRulesOutput,
});

export const setPotentialFeedbackInput = z.object({
	contactIds: z.array(z.string().min(1)).min(1).max(200),
	verdict: z.enum(["good", "bad", "later"]).nullable(),
	note: z.string().trim().max(500).optional(),
});

export const potentialFeedbackOutput = z.object({
	contactIds: z.array(z.string()),
	verdict: z.string().nullable(),
});

export type SetPotentialFeedbackInput = z.infer<
	typeof setPotentialFeedbackInput
>;
export type ReactivationListInput = z.infer<typeof reactivationListInput>;
export type ReactivationListOutput = z.infer<typeof reactivationListOutput>;

export const readingProgressOutput = z.object({
	threads: z.number(),
	read: z.number(),
	pending: z.number(),
	relevant: z.number(),
	perHour: z.number(),
	etaMinutes: z.number().nullable(),
	paused: z.boolean(),
});

export type ReadingProgress = z.infer<typeof readingProgressOutput>;

export const winBackRulesStateOutput = z.object({
	mode: z.enum(["auto", "manual"]),
	note: z.string().nullable(),
	tunedAt: z.string().nullable(),
	tuning: z.boolean(),
	verdicts: z.number(),
	playbook: z
		.object({
			summary: z.string(),
			offers: z.array(z.string()),
			prices: z.array(z.string()),
			conditions: z.array(z.string()),
			accepts: z.array(z.string()),
			declines: z.array(z.string()),
			learnedAt: z.string().nullable(),
			sentEmails: z.number(),
		})
		.nullable(),
});

export const setWinBackRulesModeInput = z.object({
	mode: z.enum(["auto", "manual"]),
});

export type WinBackRulesState = z.infer<typeof winBackRulesStateOutput>;
