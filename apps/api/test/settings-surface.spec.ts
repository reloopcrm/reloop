import { describe, expect, it } from "bun:test";
import * as contracts from "../src/settings/settings.contracts";
import { SettingsRouter } from "../src/settings/settings.router";
import { SettingsService } from "../src/settings/settings.service";

const GONE = ["researchKey", "setResearchKey", "skipResearchKey"] as const;

describe("the settings surface offers no research key", () => {
	it("exposes no procedure for it", () => {
		for (const name of GONE) {
			expect(
				Object.getOwnPropertyNames(SettingsRouter.prototype),
			).not.toContain(name);
		}
	});

	it("carries no service method for it", () => {
		for (const name of GONE) {
			expect(
				Object.getOwnPropertyNames(SettingsService.prototype),
			).not.toContain(name);
		}
	});

	it("keeps no contract for it", () => {
		expect(Object.keys(contracts)).not.toContain("researchKeyOutput");
		expect(Object.keys(contracts)).not.toContain("setResearchKeyInput");
	});
});
