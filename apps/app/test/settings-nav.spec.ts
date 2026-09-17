import { describe, expect, it } from "bun:test";
import { settingsNavItems } from "../app/(app)/[slug]/settings/settings-sidebar";

const titles = (cloudOwner: boolean) =>
	settingsNavItems(cloudOwner).map((item) => item.title);

describe("the settings navigation", () => {
	it("hides the waitlist from a self-hosted install", () => {
		expect(titles(false)).not.toContain("Waitlist");
	});

	it("shows the waitlist to the owner of the cloud install", () => {
		expect(titles(true)).toContain("Waitlist");
	});

	it("keeps every other entry in both installs", () => {
		expect(titles(false)).toEqual(
			titles(true).filter((title) => title !== "Waitlist"),
		);
	});
});
