import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { DealStage } from "@crm/db/enums";
import type { Locale } from "@crm/db/locale";
import type { DealExportRow } from "../src/deals/deals.service";
import { DEAL_COLUMNS } from "../src/exports/exports.service";
import { EXPORTS } from "../src/exports/exports-config";
import { SettingsService } from "../src/settings/settings.service";

const stageColumn = DEAL_COLUMNS.find((column) => column.header === "Stage");

function stageCell(
	stage: DealStage,
	locale: Locale,
	names: Record<string, string>,
): string {
	if (!stageColumn) throw new Error("The deal export has no stage column.");

	return stageColumn.value({ stage } as unknown as DealExportRow, {
		locale,
		moment: EXPORTS.time.format("UTC"),
		stageNames: names,
	});
}

describe("the deal export", () => {
	it("writes the name the operator typed, in both languages", () => {
		const names = { DEMO_BOOKED: "Anfrage erhalten" };

		expect(stageCell(DealStage.DEMO_BOOKED, "en", names)).toBe(
			"Anfrage erhalten",
		);
		expect(stageCell(DealStage.DEMO_BOOKED, "de", names)).toBe(
			"Anfrage erhalten",
		);
	});

	it("writes the built-in name when the operator renamed nothing", () => {
		expect(stageCell(DealStage.DEMO_BOOKED, "en", {})).toBe("Demo booked");
		expect(stageCell(DealStage.DEMO_BOOKED, "de", {})).toBe(
			"Termin vereinbart",
		);
	});

	it("keeps German on a stage the operator did not rename", () => {
		const names = { DEMO_BOOKED: "Anfrage erhalten" };

		expect(stageCell(DealStage.CONTRACT_SENT, "de", names)).toBe(
			"Vertrag verschickt",
		);
	});
});

function settings(role: string | null) {
	const db = {
		member: { findUnique: async () => (role ? { role } : null) },
	} as unknown as Db;
	const unused = undefined as never;
	return new SettingsService(db, unused, unused, unused);
}

describe("renaming a pipeline stage", () => {
	it("refuses a member before any database write", async () => {
		await expect(
			settings("member").setDealStageName("member", {
				stage: DealStage.DEMO_BOOKED,
				name: "Anfrage erhalten",
			}),
		).rejects.toThrow("Only a workspace admin");
	});

	it("refuses somebody who is not in the workspace", async () => {
		await expect(
			settings(null).setDealStageName("stranger", {
				stage: DealStage.DEMO_BOOKED,
				name: "Anfrage erhalten",
			}),
		).rejects.toThrow("Only a workspace admin");
	});
});
