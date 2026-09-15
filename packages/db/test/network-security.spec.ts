import { afterEach, describe, expect, it, spyOn } from "bun:test";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { resolvePublicHost, safeFetch } from "../src/safe-fetch";

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

describe("outbound network boundaries", () => {
	it("rejects private addresses without opening a connection", async () => {
		for (const host of [
			"127.0.0.1",
			"10.0.0.1",
			"169.254.169.254",
			"::1",
			"::ffff:127.0.0.1",
		]) {
			expect(await resolvePublicHost(host)).toBeNull();
		}
	});

	it("rejects a hostname with public and private DNS answers", async () => {
		spies.push(
			spyOn(dns, "lookup").mockResolvedValue([
				{ address: "8.8.8.8", family: 4 },
				{ address: "127.0.0.1", family: 4 },
			] as never),
		);
		expect(await safeFetch("https://mixed.example")).toBeNull();
	});

	it("pins the checked DNS answer at the socket boundary", async () => {
		const lookup = spyOn(dns, "lookup").mockResolvedValue([
			{ address: "8.8.8.8", family: 4 },
		] as never);
		spies.push(lookup);
		let pinned: unknown;
		const request = spyOn(https, "request").mockImplementation(((
			_url: URL,
			options: https.RequestOptions,
		) => {
			options.lookup?.("rebound.example", { all: true }, (_error, answer) => {
				pinned = answer;
			});
			throw new Error("Test stops before opening a socket");
		}) as typeof https.request);
		spies.push(request);
		expect(await safeFetch("https://rebound.example")).toBeNull();
		expect(pinned).toEqual([{ address: "8.8.8.8", family: 4 }]);
		expect(lookup).toHaveBeenCalledTimes(1);
	});

	it("rejects URL credentials", async () => {
		expect(await safeFetch("https://user:password@8.8.8.8")).toBeNull();
	});
});

function respond(
	status: number,
	headers: Record<string, string> = {},
	body = "ok",
	failBody = false,
) {
	const calls: https.RequestOptions[] = [];
	spies.push(
		spyOn(https, "request").mockImplementation(((
			_url: URL,
			options: https.RequestOptions,
			callback: (response: IncomingMessage) => void,
		) => {
			calls.push(options);
			const incoming = Object.assign(Readable.from([Buffer.from(body)]), {
				statusCode: status,
				headers,
			}) as IncomingMessage;
			return Object.assign(new EventEmitter(), {
				end: () => {
					queueMicrotask(() => {
						callback(incoming);
						if (failBody)
							incoming.destroy(new Error("Simulated response failure"));
					});
				},
			}) as ClientRequest;
		}) as typeof https.request),
	);
	return calls;
}

describe("HTTP response handling", () => {
	it("returns a readable body", async () => {
		respond(200);
		const result = await safeFetch("https://8.8.8.8");
		expect(await result?.response.text()).toBe("ok");
	});
	it("contains malformed response status errors", async () => {
		respond(700);
		expect(await safeFetch("https://8.8.8.8")).toBeNull();
	});
	it("removes credentials when a redirect changes origin", async () => {
		const calls = respond(302, { location: "https://1.1.1.1" });
		await safeFetch("https://8.8.8.8", {
			headers: { authorization: "Bearer test" },
		});
		expect(calls[0]?.headers).toMatchObject({ authorization: "Bearer test" });
		expect(calls[1]?.headers).not.toHaveProperty("authorization");
	});
});

it("refuses redirects to private addresses", async () => {
	const calls = respond(302, { location: "https://127.0.0.1" });
	expect(await safeFetch("https://8.8.8.8")).toBeNull();
	expect(calls).toHaveLength(1);
});

it("refuses redirects that remove TLS", async () => {
	const calls = respond(302, { location: "http://1.1.1.1" });
	expect(await safeFetch("https://8.8.8.8")).toBeNull();
	expect(calls).toHaveLength(1);
});

it("contains stream errors on responses without a body", async () => {
	respond(204, {}, "", true);
	const result = await safeFetch("https://8.8.8.8");
	expect(result?.response.status).toBe(204);
	expect(await result?.response.text()).toBe("");
});

it("reports response body failure to the caller", async () => {
	respond(200, {}, "", true);
	const result = await safeFetch("https://8.8.8.8");
	expect(result).not.toBeNull();
	await expect(result?.response.text()).rejects.toThrow(
		"Simulated response failure",
	);
});
