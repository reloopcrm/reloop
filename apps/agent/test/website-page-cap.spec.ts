import { afterAll, describe, expect, it, spyOn } from "bun:test";
import * as safeFetchModule from "@crm/db/safe-fetch";
import { fetchPage } from "../agent/lib/website-brand";
import { WEBSITE } from "../agent/lib/website-config";

const CHUNK_BYTES = 64 * 1_024;
const TOTAL_BYTES = 16 * WEBSITE.htmlMaxBytes;

let pulled = 0;

function endlessPage(): ReadableStream<Uint8Array> {
	const chunk = new TextEncoder().encode(
		`<html><body>${"a".repeat(CHUNK_BYTES)}`,
	);

	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (pulled >= TOTAL_BYTES) {
				controller.close();
				return;
			}
			pulled += chunk.byteLength;
			controller.enqueue(chunk);
		},
	});
}

const spy = spyOn(safeFetchModule, "safeFetch").mockImplementation(
	async (url) => ({
		url: new URL(url),
		response: new Response(endlessPage(), {
			status: 200,
			headers: { "content-type": "text/html; charset=utf-8" },
		}),
	}),
);

afterAll(() => {
	spy.mockRestore();
});

describe("reading a company's website", () => {
	it("stops reading the body at the cap instead of loading all of it", async () => {
		const page = await fetchPage("huge-page.test");

		expect(page).not.toBeNull();
		expect(
			new TextEncoder().encode(page?.html ?? "").byteLength,
		).toBeLessThanOrEqual(WEBSITE.htmlMaxBytes + 3);
		expect(pulled).toBeLessThan(WEBSITE.htmlMaxBytes + 4 * CHUNK_BYTES);
	});
});
