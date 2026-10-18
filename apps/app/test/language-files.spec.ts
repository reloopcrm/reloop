import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { LOCALES } from "@crm/db/locale";
import { z } from "zod";
import { DICTIONARY_MODULES } from "../lib/i18n/dictionaries";

const root = fileURLToPath(new URL("../lib/i18n/", import.meta.url));

const languageFile = z.record(z.string().min(1), z.string().trim().min(1));

const variables = (text: string) =>
	[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

async function files(): Promise<string[]> {
	const found: string[] = [];
	for await (const path of new Bun.Glob("*/*.json").scan(root))
		found.push(path);
	return found.sort();
}

describe("the language folders", () => {
	it("hold one folder per language, English aside", async () => {
		const folders = [
			...new Set((await files()).map((path) => path.split("/")[0])),
		];

		expect(folders.sort()).toEqual(
			LOCALES.filter((locale) => locale !== "en")
				.map(String)
				.sort(),
		);
	});

	it("hold the same file names as German", async () => {
		const byFolder = new Map<string, string[]>();
		for (const path of await files()) {
			const [folder, file] = path.split("/");
			if (!folder || !file) continue;
			byFolder.set(folder, [...(byFolder.get(folder) ?? []), file]);
		}

		const german = byFolder.get("de")?.sort();
		expect(german?.length).toBeGreaterThan(0);
		for (const [folder, names] of byFolder)
			expect(names.sort(), folder).toEqual(german ?? []);
	});

	it("are registered in dictionaries.ts", async () => {
		for (const path of await files()) {
			const [folder, file] = path.split("/");
			if (!folder || !file) continue;
			const modules =
				DICTIONARY_MODULES[folder as keyof typeof DICTIONARY_MODULES];

			expect(Object.keys(modules), folder).toContain(file.replace(".json", ""));
		}
	});

	it("parse, and every value keeps the placeholders of its English key", async () => {
		const problems: string[] = [];

		for (const path of await files()) {
			const text = await Bun.file(`${root}${path}`).text();
			const parsed = languageFile.safeParse(JSON.parse(text));

			if (!parsed.success) {
				problems.push(`${path}: ${parsed.error.issues[0]?.message}`);
				continue;
			}

			for (const [key, value] of Object.entries(parsed.data))
				if (variables(value).join() !== variables(key).join())
					problems.push(`${path}: ${key} -> ${value}`);
		}

		expect(problems).toEqual([]);
	});
});
