import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) =>
	readFileSync(join(import.meta.dir, "../src/components", name), "utf8");

function contentClasses(source: string, slot: string) {
	const start = source.indexOf(`data-slot="${slot}"`);
	const end = source.indexOf("{...props}", start);
	return source.slice(start, end);
}

describe("dialog content height", () => {
	for (const [file, slot] of [
		["dialog.tsx", "dialog-content"],
		["alert-dialog.tsx", "alert-dialog-content"],
	] as const) {
		it(`${file} caps its height at the dynamic viewport and scrolls inside`, () => {
			const classes = contentClasses(read(file), slot);
			expect(classes).toContain("max-h-[calc(100dvh-2rem)]");
			expect(classes).toContain("overflow-y-auto");
			expect(classes).toContain("overscroll-contain");
		});
	}
});
