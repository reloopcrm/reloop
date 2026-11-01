import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { DOCS, type DocFile } from "./docs-config";
import { type Block, parseMarkdown } from "./markdown";

export async function readDoc(file: DocFile): Promise<Block[] | null> {
	"use cache";
	cacheLife(DOCS.cache.life);
	const path = join(process.cwd(), ...DOCS.root, ...DOCS.files[file]);
	try {
		return parseMarkdown(await readFile(path, "utf8"));
	} catch (error) {
		console.error(`Docs: could not read ${path}.`, error);
		return null;
	}
}
