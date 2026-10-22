import { describe, expect, it } from "bun:test";
import { APP_NAV_SECTIONS } from "../cloud/slots.data";
import { appNav } from "../cloud/slots.server";
import { type NavItem, withNavSlots } from "../components/app-sidebar";

const icon: NavItem["icon"] = () => null;

const BASE: NavItem[] = [
	{
		title: "Overview",
		href: "/",
		icon,
		match: "exact",
		transition: "nav-lateral",
	},
	{
		title: "Win back",
		href: "/win-back",
		icon,
		match: "prefix",
		transition: "nav-lateral",
	},
	{
		title: "Deals",
		href: "/deals",
		icon,
		match: "prefix",
		transition: "nav-lateral",
	},
];

describe("the public app nav slot", () => {
	it("is empty by default", async () => {
		expect(await appNav()).toEqual([]);
		expect(APP_NAV_SECTIONS).toEqual([]);
	});

	it("leaves the sidebar untouched without entries", () => {
		expect(withNavSlots(BASE, [])).toEqual(BASE);
	});

	it("inserts an entry right after the row it names", () => {
		const items = withNavSlots(BASE, [
			{ title: "Reports", href: "/reports", icon: "email", after: "/win-back" },
		]);

		expect(items.map((item) => item.href)).toEqual([
			"/",
			"/win-back",
			"/reports",
			"/deals",
		]);
		expect(items[2]?.match).toBe("prefix");
	});

	it("appends an entry whose anchor is unknown", () => {
		const items = withNavSlots(BASE, [
			{ title: "Reports", href: "/reports", icon: "renew", after: "/missing" },
		]);

		expect(items.at(-1)?.href).toBe("/reports");
	});

	it("keeps slot order when two entries share an anchor", () => {
		const items = withNavSlots(BASE, [
			{ title: "A", href: "/a", icon: "email", after: "/" },
			{ title: "B", href: "/b", icon: "user-multiple", after: "/" },
		]);

		expect(items.map((item) => item.href).slice(0, 3)).toEqual([
			"/",
			"/a",
			"/b",
		]);
	});
});
