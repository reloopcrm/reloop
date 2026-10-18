import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import express from "express";
import { z } from "zod";
import { REQUEST_SIZE } from "../src/http/http-config";
import {
	requestSizeLimit,
	trpcBodyLimit,
} from "../src/http/request-size.middleware";

let declared: Server;
let declaredPort = 0;
let streamed: Server;
let streamedPort = 0;

beforeAll(async () => {
	const guard = requestSizeLimit();

	declared = createServer((request, response) => {
		guard(request, response, () => {
			request.resume();
			request.on("end", () => {
				response.writeHead(200);
				response.end("read");
			});
		});
	});

	const trpc = express();
	trpc.use(REQUEST_SIZE.trpc.path, trpcBodyLimit());
	trpc.use((_request, response) => {
		response.status(200).end("read");
	});
	streamed = createServer(trpc);

	await Promise.all([
		new Promise<void>((done) => declared.listen(0, "127.0.0.1", done)),
		new Promise<void>((done) => streamed.listen(0, "127.0.0.1", done)),
	]);

	declaredPort = portOf(declared);
	streamedPort = portOf(streamed);
});

afterAll(async () => {
	for (const server of [declared, streamed]) {
		server.closeAllConnections();
		await new Promise<void>((done) => {
			server.close(() => done());
		});
	}
});

const listening = z.object({ port: z.number() });

function portOf(server: Server): number {
	return listening.parse(server.address()).port;
}

function open(port: number): Promise<Socket> {
	return new Promise((done) => {
		const socket = connect(port, "127.0.0.1", () => done(socket));
	});
}

function statusOf(socket: Socket): Promise<string> {
	return new Promise((done) => {
		let answer = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => {
			answer += chunk;
			if (answer.includes("\r\n")) done(answer.split("\r\n")[0] ?? "");
		});
		socket.on("close", () => done(answer.split("\r\n")[0] ?? ""));
		socket.on("error", () => done(answer.split("\r\n")[0] ?? ""));
	});
}

describe("request size limit", () => {
	it("refuses a declared body over the cap before it arrives", async () => {
		const socket = await open(declaredPort);
		socket.write(
			`POST /api/trpc/x HTTP/1.1\r\nHost: t\r\nContent-Type: application/json\r\nContent-Length: ${
				REQUEST_SIZE.body.maxBytes + 1
			}\r\n\r\n`,
		);

		const status = await statusOf(socket);
		socket.destroy();

		expect(status).toContain("413");
	});

	it("refuses a smaller declared body on the auth routes", async () => {
		const socket = await open(declaredPort);
		socket.write(
			`POST /api/auth/sign-in/email HTTP/1.1\r\nHost: t\r\nContent-Type: application/json\r\nContent-Length: ${
				REQUEST_SIZE.auth.maxBytes + 1
			}\r\n\r\n`,
		);

		const status = await statusOf(socket);
		socket.destroy();

		expect(status).toContain("413");
		expect(REQUEST_SIZE.auth.maxBytes).toBeLessThan(REQUEST_SIZE.body.maxBytes);
	});

	it("takes a body inside the cap", async () => {
		const socket = await open(declaredPort);
		const body = "x".repeat(1024);
		socket.write(
			`POST /api/trpc/x HTTP/1.1\r\nHost: t\r\nContent-Length: ${body.length}\r\n\r\n${body}`,
		);

		const status = await statusOf(socket);
		socket.destroy();

		expect(status).toContain("200");
	});

	it("cuts a chunked tRPC body that hides its size", async () => {
		const socket = await open(streamedPort);
		socket.write(
			"POST /api/trpc/x HTTP/1.1\r\nHost: t\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n",
		);

		const status = statusOf(socket);
		const chunk = "y".repeat(512 * 1024);
		const frame = `${chunk.length.toString(16)}\r\n${chunk}\r\n`;
		const frames = Math.ceil(REQUEST_SIZE.body.maxBytes / chunk.length) + 2;

		for (let index = 0; index < frames; index += 1) {
			if (socket.destroyed || socket.writableEnded) break;
			socket.write(frame);
			await Bun.sleep(0);
		}

		socket.write("0\r\n\r\n");

		expect(await status).toContain("413");
		socket.destroy();
	}, 60_000);
});
