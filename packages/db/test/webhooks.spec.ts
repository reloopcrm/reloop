import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { resolvePublicHost } from "../src/safe-fetch";
import { signWebhookBody, WEBHOOKS } from "../src/webhooks";

describe("the webhook signature", () => {
	it("is what the receiver computes from the body and the timestamp", () => {
		const body = JSON.stringify({ type: "deal.created", id: "task-1" });
		const timestamp = "1758196800000";
		const secret = "a-secret-with-enough-length";

		const receiver = createHmac("sha256", secret)
			.update(`${timestamp}.${body}`)
			.digest("hex");

		expect(signWebhookBody(body, secret, timestamp)).toBe(
			`${WEBHOOKS.signatureVersion}=${receiver}`,
		);
	});

	it("changes when the body, the timestamp or the secret changes", () => {
		const body = '{"type":"deal.created"}';
		const signature = signWebhookBody(body, "secret-one-secret-one", "1");

		expect(signWebhookBody(`${body} `, "secret-one-secret-one", "1")).not.toBe(
			signature,
		);
		expect(signWebhookBody(body, "secret-one-secret-one", "2")).not.toBe(
			signature,
		);
		expect(signWebhookBody(body, "secret-two-secret-two", "1")).not.toBe(
			signature,
		);
	});
});

describe("a webhook address on a private network", () => {
	const privateHosts = [
		"127.0.0.1",
		"10.0.0.1",
		"192.168.1.10",
		"172.16.0.1",
		"::1",
		"::ffff:127.0.0.1",
		"fd00::1",
	];

	const neverAllowed = [
		"169.254.169.254",
		"fe80::1",
		"0.0.0.0",
		"::",
		"224.0.0.1",
	];

	it("is refused while the webhook does not allow one", async () => {
		for (const host of privateHosts) {
			expect(await resolvePublicHost(host, 500)).toBeNull();
		}
	});

	it("is allowed once the webhook says so", async () => {
		for (const host of privateHosts) {
			expect(await resolvePublicHost(host, 500, true)).not.toBeNull();
		}
	});

	it("never allows a link-local, unspecified or multicast address", async () => {
		for (const host of neverAllowed) {
			expect(await resolvePublicHost(host, 500, true)).toBeNull();
		}
	});

	it("keeps a public address public", async () => {
		expect(await resolvePublicHost("8.8.8.8", 500)).not.toBeNull();
	});
});
