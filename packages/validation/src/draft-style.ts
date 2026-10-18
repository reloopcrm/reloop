import type { Db } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { z } from "zod";

export const DRAFT_STYLE = {
	maxRules: 12,
	ruleMaxChars: 200,
	instructionMaxChars: 500,
} as const;

export const DRAFT_ROLES = ["seller", "buyer", "unclear"] as const;

export type DraftRole = (typeof DRAFT_ROLES)[number];

export const draftRole = z.enum(DRAFT_ROLES);

export function readDraftRole(value: string | null): DraftRole | null {
	return DRAFT_ROLES.find((role) => role === value) ?? null;
}

export const draftStyleRule = z.object({
	id: z.string().trim().min(1).max(40),
	text: z.string().trim().min(1).max(DRAFT_STYLE.ruleMaxChars),
	learnedAt: z.string(),
});

export const draftStyle = z.object({
	rules: z.array(draftStyleRule).max(DRAFT_STYLE.maxRules),
});

export type DraftStyleRule = z.infer<typeof draftStyleRule>;
export type DraftStyle = z.infer<typeof draftStyle>;

export const EMPTY_DRAFT_STYLE: DraftStyle = { rules: [] };

export function parseDraftStyle(value: unknown): DraftStyle {
	const parsed = draftStyle.safeParse(value);
	return parsed.success ? parsed.data : EMPTY_DRAFT_STYLE;
}

export function withDraftStyleRule(
	current: DraftStyle,
	rule: DraftStyleRule,
): DraftStyle {
	const text = rule.text.trim().slice(0, DRAFT_STYLE.ruleMaxChars);
	if (!text) return current;

	const same = (other: DraftStyleRule) =>
		other.text.trim().toLowerCase() === text.toLowerCase();
	const kept = current.rules.filter((other) => !same(other));

	return {
		rules: [{ ...rule, text }, ...kept].slice(0, DRAFT_STYLE.maxRules),
	};
}

export function withoutDraftStyleRule(
	current: DraftStyle,
	ruleId: string,
): DraftStyle {
	return { rules: current.rules.filter((rule) => rule.id !== ruleId) };
}

export function draftStylePrompt(style: DraftStyle): string {
	if (style.rules.length === 0) return "";

	const lines = style.rules.map((rule) => `- ${rule.text}`).join("\n");
	return `Rules the sender gave you for these emails. Follow every one:\n${lines}`;
}

type DraftStyleStore = Pick<Db, "appSetting">;

export async function readDraftStyle(db: DraftStyleStore): Promise<DraftStyle> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { draftStyle: true },
	});

	return parseDraftStyle(row?.draftStyle);
}

export async function writeDraftStyle(
	db: DraftStyleStore,
	style: DraftStyle,
): Promise<void> {
	const fields = { draftStyle: style };

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ...fields },
		update: fields,
	});
}
