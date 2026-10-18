import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { SHOTS, type ShotName, shotSrc } from "../components/site/site-config";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const folder = `${publicDir}${SHOTS.path}/`;
const sets = { en: [] as string[], de: [] as string[] };
for (const locale of ["en", "de"] as const)
	for (const name of Object.keys(SHOTS.images) as ShotName[])
		for (const theme of SHOTS.themes)
			sets[locale].push(
				shotSrc(name, theme, locale).slice(SHOTS.path.length + 1),
			);
const files = [...sets.en, ...sets.de];

describe("the product shots", () => {
	it("ship a light and a dark file for every name in English and German", async () => {
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

	it("stay under two megabytes per language", async () => {
		for (const set of Object.values(sets)) {
			let bytes = 0;
			for (const file of set) bytes += Bun.file(`${folder}${file}`).size;
			expect(bytes).toBeLessThan(2 * 1024 * 1024);
		}
	});
});
