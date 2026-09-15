import type { Db } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import {
	DEFAULT_WIN_BACK_RULES,
	type WinBackRuleSet,
} from "@crm/db/win-back-rules";
import { z } from "zod";

const points = z.number().int().min(0).max(1000);

export const winBackRules: z.ZodType<WinBackRuleSet> = z.object({
	v: z.literal(1),
	include: z.object({
		neverReplied: z.boolean(),
		requireCompany: z.boolean(),
		requireDeal: z.boolean(),
		requireMeeting: z.boolean(),
		requireTopic: z.boolean(),
		minEmails: z.number().int().min(1).max(1000),
		minFromThem: z.number().int().min(0).max(1000),
	}),
	business: z.object({
		description: z.string().trim().max(2000),
		products: z.array(z.string().trim().min(1).max(60)).max(50),
		sideProducts: z
			.array(z.string().trim().min(1).max(60))
			.max(50)
			.default(["CP-Palette", "CP1", "CP2", "CP3", "Einwegpalette"]),
		minPallets: z.number().int().min(0).max(1_000_000),
		minBoxes: z.number().int().min(0).max(1_000_000).default(15),
		boxProducts: z
			.array(z.string().trim().min(1).max(60))
			.max(50)
			.default(["Gitterbox"]),
		unit: z
			.string()
			.trim()
			.min(1)
			.max(30)
			.default(DEFAULT_WIN_BACK_RULES.business.unit),
		learnedFromMail: z
			.boolean()
			.default(DEFAULT_WIN_BACK_RULES.business.learnedFromMail),
	}),
	points: z.object({
		waitingOnUs: points,
		perEmailFromThem: points,
		perEmailFromUs: points,
		perMeeting: points,
		openDeal: points,
		wonDeal: points,
		hasCompany: points,
		titleKeyword: points,
		pastBusiness: points,
		openInquiry: points,
		bigQuantity: points,
		productMatch: points,
		sideProductMatch: points.default(
			DEFAULT_WIN_BACK_RULES.points.sideProductMatch,
		),
		goodFeedback: points,
	}),
	titleKeywords: z.array(z.string().trim().min(1).max(60)).max(50),
	excludedDomains: z
		.array(z.string().trim().toLowerCase().min(1).max(253))
		.max(200),
});

export type WinBackRules = WinBackRuleSet;

export { DEFAULT_WIN_BACK_RULES };

export function parseWinBackRules(value: unknown): WinBackRules {
	if (value === null || value === undefined) return DEFAULT_WIN_BACK_RULES;

	const parsed = winBackRules.safeParse(value);
	return parsed.success ? parsed.data : DEFAULT_WIN_BACK_RULES;
}

export async function readWinBackRules(db: Db): Promise<WinBackRules> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { winBackRules: true },
	});

	return parseWinBackRules(row?.winBackRules);
}

export async function writeWinBackRules(
	db: Db,
	rules: WinBackRules,
): Promise<WinBackRules> {
	const clean = winBackRules.parse(rules);

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, winBackRules: clean },
		update: { winBackRules: clean },
	});

	return clean;
}

export const WIN_BACK_RULE_MODES = ["auto", "manual"] as const;

export type WinBackRuleMode = (typeof WIN_BACK_RULE_MODES)[number];

export type WinBackRulesState = {
	mode: WinBackRuleMode;
	note: string | null;
	tunedAt: Date | null;
};

export async function readWinBackRulesState(
	db: Db,
): Promise<WinBackRulesState> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: {
			winBackRulesMode: true,
			winBackRulesNote: true,
			winBackRulesTunedAt: true,
		},
	});

	return {
		mode: row?.winBackRulesMode === "manual" ? "manual" : "auto",
		note: row?.winBackRulesNote ?? null,
		tunedAt: row?.winBackRulesTunedAt ?? null,
	};
}

export async function writeWinBackRulesState(
	db: Db,
	state: Partial<WinBackRulesState>,
): Promise<void> {
	const fields = {
		...(state.mode !== undefined && { winBackRulesMode: state.mode }),
		...(state.note !== undefined && { winBackRulesNote: state.note }),
		...(state.tunedAt !== undefined && { winBackRulesTunedAt: state.tunedAt }),
	};

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ...fields },
		update: fields,
	});
}
