import { describe, expect, it } from "bun:test";
import { settingsNavItems } from "../app/(app)/[slug]/settings/settings-sidebar";
import { BILLING_SETTINGS_NAV } from "../cloud/slots.data";

const titles = (audience: { hosted?: boolean; admin?: boolean }) =>
	settingsNavItems(audience).map((item) => item.title);

describe("the settings navigation", () => {
	it("never lists the waitlist", () => {
		expect(titles({})).not.toContain("Waitlist");
		expect(titles({ hosted: true, admin: true })).not.toContain("Waitlist");
	});

	it("puts AI directly below Connections on a self-hosted install", () => {
		const order = titles({});
		expect(order.indexOf("AI")).toBe(order.indexOf("Connections") + 1);
		expect(order).not.toContain("Usage");
		expect(order).not.toContain("Plan & billing");
	});

	it("renames AI to Usage and puts the billing slot at the end for a hosted admin", () => {
		const order = titles({ hosted: true, admin: true });
		const billing = BILLING_SETTINGS_NAV.map((item) => item.title);
		expect(order).not.toContain("AI");
		expect(order.indexOf("Usage")).toBe(order.length - billing.length - 1);
		expect(order.slice(order.length - billing.length)).toEqual(billing);
	});

	it("separates Usage and the billing slot from the other entries", () => {
		const items = settingsNavItems({
			hosted: true,
			admin: true,
		});
		const plan = 1 + BILLING_SETTINGS_NAV.length;
		expect(items.map((item) => item.group)).toEqual([
			...Array(items.length - plan).fill(undefined),
			...Array(plan).fill("plan"),
		]);
	});

	it("hides billing from a hosted member", () => {
		const order = titles({ hosted: true, admin: false });
		expect(order).toContain("Usage");
		for (const item of BILLING_SETTINGS_NAV.filter((slot) => slot.admin))
			expect(order).not.toContain(item.title);
	});
});
