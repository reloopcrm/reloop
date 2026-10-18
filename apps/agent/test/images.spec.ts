import { describe, expect, it } from "bun:test";
import { findPortrait } from "../agent/lib/portrait-sources";

describe("the portrait source chain", () => {
	const NOBODY = {
		id: "c1",
		name: "Paula Marchetti",
		githubUrl: null,
	};

	it("uses a verified GitHub account", () => {
		const result = findPortrait({
			...NOBODY,
			githubUrl: "https://github.com/pmarchetti",
		});

		expect(result.found).toBe(true);
		if (result.found) {
			expect(result.candidate.source).toBe("github");
			expect(result.candidate.url).toContain("github.com/pmarchetti.png");
		}
	});

	it("does not mistake a repository for a person", () => {
		const result = findPortrait({
			...NOBODY,
			githubUrl: "https://github.com/acme/crm",
		});

		expect(result.found).toBe(false);
	});

	it("looks nowhere at all when the record points nowhere", () => {
		const result = findPortrait(NOBODY);

		expect(result.found).toBe(false);
		if (!result.found) expect(result.tried).toEqual([]);
	});
});
