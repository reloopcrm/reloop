import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { workspaceSlug } from "@crm/db/workspace";
import { HOSTED_ROUTES, MARKETING_ROUTES } from "../cloud/slots.data";
import { PROXY } from "../lib/proxy-config";

const appDir = fileURLToPath(new URL("../app/", import.meta.url));

const GROUP = /^\(.+\)$/;
const DYNAMIC = /^\[.+\]$/;

function routeFolders(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory() || DYNAMIC.test(entry.name)) return [];
		if (GROUP.test(entry.name)) return routeFolders(`${dir}${entry.name}/`);
		return [entry.name];
	});
}

function firstSegment(path: string): string | undefined {
	return path.split("/").find(Boolean);
}

function proxyPaths(): string[] {
	const lists = [
		...Object.values(PROXY.path),
		...PROXY.anonymous,
		...PROXY.marketing,
		...PROXY.cloudOnly,
		...PROXY.ungated,
		...PROXY.sections,
		...PROXY.workspaceSegments,
		...MARKETING_ROUTES,
		...HOSTED_ROUTES,
	];
	return lists.flatMap((path) => firstSegment(path) ?? []);
}

const SEGMENTS = [
	...new Set([...routeFolders(appDir), ...proxyPaths()]),
].sort();

describe("reserved workspace slugs", () => {
	it("finds the top level routes it guards", () => {
		expect(SEGMENTS).toEqual(
			expect.arrayContaining([
				"docs",
				"win-back",
				"t",
				"paused",
				"eve",
				"opengraph-image",
			]),
		);
	});

	for (const segment of SEGMENTS)
		it(`never gives a workspace the slug of /${segment}`, () => {
			expect(workspaceSlug(segment)).not.toBe(segment);
		});
});
