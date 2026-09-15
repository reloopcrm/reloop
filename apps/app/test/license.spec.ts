import { describe, expect, it } from "bun:test";
import { MIT_LICENSE } from "../lib/license";
import { ANONYMOUS_PATHS } from "../proxy";

const FILE = new URL("../../../LICENSE", import.meta.url);

describe("the licence the open source page shows", () => {
	it("is kept word for word at the end of the licence file", async () => {
		const onDisk = await Bun.file(FILE).text();

		expect(onDisk.trim().endsWith(MIT_LICENSE.trim())).toBe(true);
	});

	it("stays open to a reader who is not signed in", () => {
		expect(ANONYMOUS_PATHS).toContain("/open-source");
	});

	it("keeps the copyright line the licence demands", () => {
		expect(MIT_LICENSE).toContain("MIT License");
		expect(MIT_LICENSE).toContain("Copyright (c)");
	});
});
