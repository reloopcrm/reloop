import { describe, expect, it } from "bun:test";
import { isDerivedName, looksMachineMade } from "../agent/lib/names";

describe("isDerivedName", () => {
	it("flags a first name that is only the local part", () => {
		expect(isDerivedName("ardit@x.com", "Ardit", null)).toBe(true);
	});

	it("flags an initial and a surname cut out of the address", () => {
		expect(isDerivedName("a.mueller@acme.com", "A", "Mueller")).toBe(true);
		expect(isDerivedName("c.lindner@enofilms.com", "C", "Lindner")).toBe(true);
		expect(isDerivedName("anna.m@acme.com", "Anna", "M")).toBe(true);
	});

	it("leaves a full name alone, even when the address spells it out", () => {
		expect(isDerivedName("anna.mueller@acme.com", "Anna", "Mueller")).toBe(
			false,
		);
		expect(isDerivedName("j.mueller@acme.com", "Anna", "Mueller")).toBe(false);
	});

	it("trusts a contact whose name says more than the address", () => {
		expect(isDerivedName("markus.peetz@x.de", "Markus", "Peetz")).toBe(false);
		expect(isDerivedName("info@x.de", "Klaus", "Berger")).toBe(false);
		expect(isDerivedName(null, "Klaus", "Berger")).toBe(false);
	});
});

describe("looksMachineMade", () => {
	it("treats initial plus surname from the address as machine made", () => {
		expect(looksMachineMade("c.lindner@enofilms.com", "C", "Lindner")).toBe(
			true,
		);
		expect(looksMachineMade("t.angermueller@x.de", "T", "Angermueller")).toBe(
			true,
		);
	});

	it("treats a name that only mirrors the address as machine made", () => {
		expect(looksMachineMade("markus.peetz@x.de", "Markus", "Peetz")).toBe(true);
		expect(looksMachineMade("ardit@x.com", "Ardit", null)).toBe(true);
	});

	it("keeps a name that carries more than the address", () => {
		expect(looksMachineMade("info@x.de", "Klaus", "Berger")).toBe(false);
		expect(looksMachineMade(null, "Klaus", "Berger")).toBe(false);
	});
});
