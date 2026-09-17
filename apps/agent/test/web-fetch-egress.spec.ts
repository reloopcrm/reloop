import { describe, expect, it } from "bun:test";
import type { ToolContext } from "eve/tools";
import { webFetch } from "eve/tools/defaults";

const ctx = {} as unknown as ToolContext;

const REFUSED = [
	"http://api:3001/internal/crm/dispatch",
	"http://postgres:5432/",
	"https://localhost:3001/",
	"https://127.0.0.1/",
	"https://10.0.0.5/",
	"https://172.18.0.2:3001/",
	"https://192.168.1.10/",
	"https://169.254.169.254/latest/meta-data/",
	"https://100.100.100.200/",
	"https://[::1]/",
];

describe("web_fetch is the one way out, and it reaches nothing private", () => {
	for (const url of REFUSED) {
		it(`refuses ${url}`, async () => {
			await expect(webFetch.execute({ url }, ctx)).rejects.toThrow(
				/must start with https:|must not target/,
			);
		});
	}
});
