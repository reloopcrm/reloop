import { afterEach, describe, expect, it, mock } from "bun:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DOCS, docPath } from "../components/landing/docs-config";

const nextServer = await import("next/server");
mock.module("next/server", () => ({
	...nextServer,
	connection: async () => {},
}));

const { GET } = await import("../app/llms.txt/route");

const root = fileURLToPath(new URL("../", import.meta.url));

const LINK = /^- \[[^\]]+\]\(([^)]+)\): .+$/;

const body = await (await GET()).text();

const hrefs = body
	.split("\n")
	.map((line) => LINK.exec(line)?.[1])
	.filter((href): href is string => href !== undefined);

function landingFile(path: string): string {
	const segments = path === "/" ? "" : `${path}/`;
	return `${root}app/(landing)/${segments}page.tsx`;
}

describe("/llms.txt", () => {
	it("is served as plain text", async () => {
		expect((await GET()).headers.get("content-type")).toBe(
			"text/plain; charset=utf-8",
		);
	});

	it("opens with the name and a blockquote summary", () => {
		const [first, blank, second] = body.split("\n");
		expect(first).toBe("# Reloop CRM");
		expect(blank).toBe("");
		expect(second?.startsWith("> Reloop CRM")).toBe(true);
	});

	it("tells an agent when to reach for the product and when not to", () => {
		expect(body).toContain("\n## When to use this\n");
		expect(body).toContain("\n## When not to use this\n");
		for (const job of ["win", "mailbox", "quantity", "Docker"]) {
			expect(body.toLowerCase()).toContain(job.toLowerCase());
		}
	});

	it("says how to call the product and how to get a key", () => {
		expect(body).toContain("x-api-key");
		expect(body).toContain("Settings, API Keys");
		expect(body).toContain("POST /api/rest/contacts/search");
	});

	it("says the OpenAPI document needs a key and never promises a public one", () => {
		expect(body).toContain("GET /api/openapi.json");
		expect(body).toContain("401");
		expect(body).toContain("is not public");
		expect(hrefs.some((href) => href.includes("openapi.json"))).toBe(false);
	});

	it("links every documentation page", () => {
		for (const page of DOCS.pages) {
			expect(
				hrefs.some((href) => href.endsWith(docPath(page.slug))),
				page.slug,
			).toBe(true);
		}
		expect(hrefs.some((href) => href.endsWith(DOCS.path))).toBe(true);
	});

	it("links the repository, the releases and the issues", () => {
		for (const path of ["/reloopcrm/reloop", "/releases", "/issues"]) {
			expect(
				hrefs.some((href) => href.endsWith(path)),
				path,
			).toBe(true);
		}
	});

	it("writes every link as an absolute address", () => {
		expect(hrefs.length).toBeGreaterThan(20);
		for (const href of hrefs) {
			expect(href.startsWith("http"), href).toBe(true);
		}
	});

	it("links no page that does not exist", () => {
		const docPaths = new Set(DOCS.pages.map((page) => docPath(page.slug)));

		for (const href of hrefs) {
			const { pathname, origin } = new URL(href);
			if (origin !== new URL(hrefs[0] ?? "http://localhost").origin) continue;
			if (pathname === DOCS.path || docPaths.has(pathname)) continue;
			expect(existsSync(landingFile(pathname)), pathname).toBe(true);
		}
	});

	it("carries no em dash and no en dash", () => {
		expect(/[–—―]/.test(body)).toBe(false);
	});
});

describe("/llms.txt with a hosted cloud elsewhere", () => {
	const saved = process.env.RELOOP_CLOUD_URL;

	afterEach(() => {
		if (saved === undefined) delete process.env.RELOOP_CLOUD_URL;
		else process.env.RELOOP_CLOUD_URL = saved;
	});

	async function pages(): Promise<string[]> {
		const text = await (await GET()).text();
		return text
			.split("\n")
			.map((line) => LINK.exec(line)?.[1])
			.filter((href): href is string => href !== undefined)
			.map((href) => new URL(href, "http://localhost").pathname);
	}

	it("lists the sign-up page when the cloud is this site", async () => {
		delete process.env.RELOOP_CLOUD_URL;

		expect(await pages()).toContain("/get-started");
	});

	it("leaves the sign-up page out when it only redirects", async () => {
		process.env.RELOOP_CLOUD_URL = "https://app.reloopcrm.com";

		expect(await pages()).not.toContain("/get-started");
	});
});
