import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import {
	DRAFT_STYLE,
	type DraftStyle,
	parseDraftStyle,
	readDraftStyle,
	withDraftStyleRule,
	writeDraftStyle,
} from "@crm/validation/draft-style";

let saved: DraftStyle | null = null;

function rule(text: string, id: string) {
	return { id, text, learnedAt: "2026-09-11T00:00:00.000Z" };
}

async function clean(): Promise<void> {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
}

beforeAll(async () => {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { draftStyle: true },
	});
	saved = row ? parseDraftStyle(row.draftStyle) : null;
	await clean();
});

afterEach(clean);

afterAll(async () => {
	await clean();
	if (saved === null) return;

	await writeDraftStyle(db, saved);
});

describe("the rules the agent keeps about my writing", () => {
	it("is empty on a fresh install", async () => {
		expect(await readDraftStyle(db)).toEqual({ rules: [] });
	});

	it("survives a write and a read", async () => {
		await writeDraftStyle(db, { rules: [rule("Schreib kurz", "a")] });

		const back = await readDraftStyle(db);

		expect(back.rules).toHaveLength(1);
		expect(back.rules[0]?.text).toBe("Schreib kurz");
	});

	it("stops at the cap after many rules, so the prompt stays small", async () => {
		let style = await readDraftStyle(db);
		for (let index = 0; index < DRAFT_STYLE.maxRules + 8; index += 1) {
			style = withDraftStyleRule(style, rule(`Regel ${index}`, `id-${index}`));
			await writeDraftStyle(db, style);
		}

		const back = await readDraftStyle(db);

		expect(back.rules).toHaveLength(DRAFT_STYLE.maxRules);
		expect(back.rules[0]?.text).toBe(`Regel ${DRAFT_STYLE.maxRules + 7}`);
		expect(back.rules.some((entry) => entry.text === "Regel 0")).toBe(false);
	});
});
