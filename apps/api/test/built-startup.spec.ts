import { expect, it } from "bun:test";
import { createServer } from "node:net";
import { z } from "zod";

it("serves health and OpenAPI from the compiled API", async () => {
	const reservation = createServer();
	await new Promise<void>((done) => reservation.listen(0, "127.0.0.1", done));
	const address = z.object({ port: z.number() }).parse(reservation.address());
	await new Promise<void>((done) => reservation.close(() => done()));
	const child = Bun.spawn(
		[
			process.execPath,
			"--preload",
			"./test/built-startup-preload.ts",
			"dist/main.js",
		],
		{
			cwd: new URL("../", import.meta.url).pathname,
			env: {
				...process.env,
				NODE_ENV: "test",
				PORT: String(address.port),
				CRM_TELEMETRY_DISABLED: "1",
				AGENT_BRIDGE_SECRET: "",
				MAILBOX_SYNC_INTERVAL_MS: "0",
				REDIS_URL: "",
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	let output = "";
	const read = async (stream: ReadableStream<Uint8Array>) => {
		for await (const chunk of stream) output += new TextDecoder().decode(chunk);
	};
	const readers = Promise.all([read(child.stdout), read(child.stderr)]);
	try {
		const deadline = Date.now() + 10_000;
		while (
			!output.includes("API listening") &&
			Date.now() < deadline &&
			child.exitCode === null
		)
			await Bun.sleep(25);
		expect(output).toContain("API listening");
		const base = `http://127.0.0.1:${address.port}`;
		const health = await fetch(`${base}/health`);
		expect(await health.json()).toEqual({ status: "ok", database: "up" });
		expect(health.headers.get("x-content-type-options")).toBe("nosniff");
		expect(health.headers.get("content-security-policy")).toBeString();
		const document = await fetch(`${base}/openapi.json`);
		expect(document.status).toBe(200);
		expect(await document.text()).toContain("/settings/password");
	} finally {
		child.kill("SIGTERM");
		await child.exited;
		await readers;
	}
}, 15_000);
