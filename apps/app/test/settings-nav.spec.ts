import { describe, expect, it } from "bun:test";
import { settingsNavItems } from "../app/(app)/[slug]/settings/settings-sidebar";

const titles = (audience: {
	cloudOwner: boolean;
	hosted?: boolean;
	admin?: boolean;
}) => settingsNavItems(audience).map((item) => item.title);

describe("the settings navigation", () => {
	it("hides the waitlist from a self-hosted install", () => {
		expect(titles({ cloudOwner: false })).not.toContain("Waitlist");
	});

	it("shows the waitlist to the owner of the cloud install", () => {
		expect(titles({ cloudOwner: true })).toContain("Waitlist");
	});

	it("puts AI directly below Connections on a self-hosted install", () => {
		const order = titles({ cloudOwner: false });
		expect(order.indexOf("AI")).toBe(order.indexOf("Connections") + 1);
		expect(order).not.toContain("Usage");
		expect(order).not.toContain("Plan & billing");
	});

	it("renames AI to Usage and adds billing for a hosted admin", () => {
		const order = titles({ cloudOwner: false, hosted: true, admin: true });
		expect(order).not.toContain("AI");
		expect(order.indexOf("Usage")).toBe(order.indexOf("Connections") + 1);
		expect(order.indexOf("Plan & billing")).toBe(order.indexOf("Usage") + 1);
	});

	it("hides billing from a hosted member", () => {
		const order = titles({ cloudOwner: false, hosted: true, admin: false });
		expect(order).toContain("Usage");
		expect(order).not.toContain("Plan & billing");
	});

	it("keeps every other entry in both installs", () => {
		expect(titles({ cloudOwner: false })).toEqual(
			titles({ cloudOwner: true }).filter((title) => title !== "Waitlist"),
		);
	});
});
