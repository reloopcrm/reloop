import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { API_KEY_HEADER } from "@crm/auth";
import express from "express";
import { REQUEST_SIZE } from "../src/http/http-config";
import { restRateLimit } from "../src/http/rest-rate-limit.middleware";

const chunk = Buffer.alloc(1_000_000, "a");
const chunks = Math.ceil(REQUEST_SIZE.body.maxBytes / chunk.length) + 8;

const client = {
	apikey: { findFirst: async () => ({ id: "body-spec" }) },
	$executeRaw: async () => 0,
	$queryRaw: async () => [{ count: 2, windowStart: BigInt(Date.now()) }],
} as never;

describe("the REST rate limit on a rejected streamed body", () => {
	let server: Server;
	let port = 0;
	let received = 0;

	beforeAll(async () => {
		const limiter = restRateLimit({ max: 1, windowMs: 60_000 }, client);
		const app = express();
		app.use((req, _res, next) => {
			req.on("data", (data: Buffer) => {
				received += data.length;
			});
			next();
		});
		app.use(limiter, (_req, res) => {
			res.end("next");
		});
		server = createServer(app);
		await new Promise<void>((resolve) => server.listen(0, resolve));
		port = (server.address() as AddressInfo).port;
	});

	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});

	it("stops reading a rejected body past the body ceiling", async () => {
		let sent = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent >= chunks) {
					controller.close();
					return;
				}
				sent += 1;
				controller.enqueue(chunk);
			},
		});
		const status = await fetch(`http://127.0.0.1:${port}/`, {
			method: "POST",
			headers: { [API_KEY_HEADER]: "body-spec-key" },
			body,
			duplex: "half",
		} as RequestInit)
			.then((response) => response.status)
			.catch(() => -1);

		expect([429, -1]).toContain(status);
		expect(received).toBeLessThan(REQUEST_SIZE.body.maxBytes + 4_000_000);
	});
});
