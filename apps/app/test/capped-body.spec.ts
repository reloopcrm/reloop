import { describe, expect, it } from "bun:test";
import { BodyTooLargeError, cappedBody } from "../lib/capped-body";

function source(chunks: number, size: number): ReadableStream<Uint8Array> {
	let sent = 0;

	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent === chunks) {
				controller.close();
				return;
			}

			sent += 1;
			controller.enqueue(new Uint8Array(size));
		},
	});
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
	const reader = stream.getReader();
	let read = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) return read;

		read += value.byteLength;
	}
}

describe("capped body", () => {
	it("passes a body inside the cap through untouched", async () => {
		let hit = false;

		const read = await drain(
			cappedBody(source(4, 250), 1_000, () => {
				hit = true;
			}),
		);

		expect(read).toBe(1_000);
		expect(hit).toBe(false);
	});

	it("errors the stream once the body passes the cap", async () => {
		let hit = false;

		const stream = cappedBody(source(1_000, 1_000), 1_000, () => {
			hit = true;
		});

		expect(drain(stream)).rejects.toBeInstanceOf(BodyTooLargeError);
		await Bun.sleep(1);
		expect(hit).toBe(true);
	});

	it("stops reading the source instead of buffering it", async () => {
		let pulled = 0;

		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += 1;
				controller.enqueue(new Uint8Array(1_000));
			},
		});

		await drain(cappedBody(endless, 4_000, () => {})).catch(() => undefined);

		expect(pulled).toBeLessThan(10);
	});
});
