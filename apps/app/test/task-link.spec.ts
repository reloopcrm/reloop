import { describe, expect, it } from "bun:test";
import { winBackTaskLink } from "../app/(app)/[slug]/task-link";

const erika = { id: "erika", firstName: "Erika", lastName: null };

describe("where an overview task leads", () => {
	it("leads the win back follow-up to the Win back person page", () => {
		expect(
			winBackTaskLink({ meta: { winBack: true }, contact: erika }),
		).toEqual({ path: "/win-back/erika", contact: erika });
	});

	it("leaves an ordinary task to the record sheet", () => {
		expect(winBackTaskLink({ meta: null, contact: erika })).toBeNull();
		expect(
			winBackTaskLink({ meta: { winBack: false }, contact: erika }),
		).toBeNull();
		expect(
			winBackTaskLink({ meta: { winBack: true, extra: 1 }, contact: erika }),
		).toBeNull();
	});

	it("needs a person to lead to", () => {
		expect(
			winBackTaskLink({ meta: { winBack: true }, contact: null }),
		).toBeNull();
	});
});
