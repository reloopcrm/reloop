import { describe, expect, it } from "bun:test";
import { readCapped } from "../src/safe-fetch";

function endless(chunk: string): Response {
	let pulls = 0;
	const bytes = new TextEncoder().encode(chunk);

	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			pulls += 1;
			if (pulls > 10_000) {
				controller.close();
				return;
			}
			controller.enqueue(bytes);
		},
	});

	return new Response(body);
}

describe("readCapped", () => {
	it("returns a short body whole", async () => {
		expect(await readCapped(new Response("hello"), 100)).toBe("hello");
	});

	it("reads an empty body as an empty string", async () => {
		expect(await readCapped(new Response(null), 100)).toBe("");
	});

	it("stops at the cap instead of reading the whole response", async () => {
		const text = await readCapped(endless("x".repeat(1_000)), 4_000);

		expect(text).toHaveLength(4_000);
	});

	it("gives up on a body that never ends", async () => {
		const forever = new Response(
			new ReadableStream<Uint8Array>({
				pull(controller) {
					controller.enqueue(new TextEncoder().encode("y".repeat(512)));
				},
			}),
		);

		const text = await Promise.race([
			readCapped(forever, 2_048),
			Bun.sleep(2_000).then(() => "timed out"),
		]);

		expect(text).toHaveLength(2_048);
	});

	it("gives up on a body that stalls", async () => {
		const stalled = new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("start"));
				},
				pull() {
					return new Promise<void>(() => undefined);
				},
			}),
		);

		const text = await Promise.race([
			readCapped(stalled, 1_000_000, 50),
			Bun.sleep(3_000).then(() => "timed out"),
		]);

		expect(text).toBe("start");
	});
});
