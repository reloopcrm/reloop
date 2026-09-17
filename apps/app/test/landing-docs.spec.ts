import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOCS } from "../components/landing/docs-config";
import { parseMarkdown, sliceBlocks } from "../components/landing/markdown";

const read = (file: keyof typeof DOCS.files) =>
	readFile(join(process.cwd(), ...DOCS.root, ...DOCS.files[file]), "utf8");

describe("the docs pages", () => {
	it("each resolve to a heading in the guide", async () => {
		for (const page of [...DOCS.pages, { ...DOCS.index.lede, slug: "index" }]) {
			const blocks = parseMarkdown(await read(page.file));
			expect(
				sliceBlocks(blocks, page.from, page.to).length,
				`${page.slug}: from "${page.from}" to "${page.to}"`,
			).toBeGreaterThan(0);
		}
	});

	it("slice between two headings and promote the levels", () => {
		const blocks = parseMarkdown(
			"# Guide\n\nIntro\n\n## Install\n\nRun it.\n\n### Asks\n\nDomain.\n\n## Update\n\nPull.",
		);

		expect(sliceBlocks(blocks, "install", "update")).toEqual([
			{ kind: "paragraph", text: "Run it." },
			{ kind: "heading", level: 2, text: "Asks" },
			{ kind: "paragraph", text: "Domain." },
		]);
		expect(sliceBlocks(blocks, "asks", "update")).toEqual([
			{ kind: "paragraph", text: "Domain." },
		]);
		expect(sliceBlocks(blocks, "update")).toEqual([
			{ kind: "paragraph", text: "Pull." },
		]);
		expect(sliceBlocks(blocks, "missing")).toEqual([]);
	});
});
