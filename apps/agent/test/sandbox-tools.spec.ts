import { describe, expect, it } from "bun:test";
import { isDisabledToolSentinel } from "eve/tools";

const OFF = ["agent", "bash", "read_file", "write_file", "glob", "grep"];

describe("the root session gets no shell and no filesystem", () => {
	for (const name of OFF) {
		it(`disables ${name}`, async () => {
			const module = await import(`../agent/tools/${name}`);

			expect(isDisabledToolSentinel(module.default)).toBe(true);
		});
	}
});
