import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { SHOTS } from "../components/site/site-config";

const folder = fileURLToPath(
	new URL(`../public${SHOTS.path}/`, import.meta.url),
);
const files = Object.keys(SHOTS.images).flatMap((name) =>
	SHOTS.themes.map((theme) => `${name}-${theme}.webp`),
);

describe("the product shots", () => {
	it("ship a light and a dark file for every name", async () => {
		const missing = [];
		for (const file of files)
			if (!(await Bun.file(`${folder}${file}`).exists())) missing.push(file);
		expect(missing).toEqual([]);
	});

	it("list every file in the manifest as example data", async () => {
		const manifest = await Bun.file(`${folder}MANIFEST.md`).text();
		const unlisted = files.filter(
			(file) =>
				!manifest
					.split("\n")
					.some(
						(line) => line.includes(`| ${file} |`) && line.includes("| yes |"),
					),
		);
		expect(unlisted).toEqual([]);
	});

	it("stay under two megabytes together", async () => {
		let bytes = 0;
		for (const file of files) bytes += Bun.file(`${folder}${file}`).size;
		expect(bytes).toBeLessThan(2 * 1024 * 1024);
	});
});
