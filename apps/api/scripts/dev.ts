import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";

const api = resolve(import.meta.dirname, "..");
const packages = resolve(api, "../../packages");
let server: ReturnType<typeof spawn> | undefined;
let compiler: ReturnType<typeof spawn> | undefined;
let pending = false;
let building = false;
let stopping = false;

async function stopServer() {
	const child = server;
	server = undefined;
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((done) => {
		child.once("exit", () => done());
		child.kill("SIGTERM");
	});
}

function startServer() {
	const child = spawn(process.execPath, ["dist/main.js"], {
		cwd: api,
		stdio: "inherit",
	});
	server = child;
	child.once("exit", (_code, signal) => {
		if (signal !== "SIGTERM" || stopping || building || server !== child) {
			return;
		}
		startServer();
	});
}

async function rebuild() {
	pending = true;
	if (building || stopping) return;
	building = true;
	try {
		while (pending && !stopping) {
			pending = false;
			const passed = await new Promise<boolean>((done) => {
				compiler = spawn(process.execPath, ["run", "build"], {
					cwd: api,
					stdio: "inherit",
				});
				compiler.once("error", () => done(false));
				compiler.once("exit", (code) => done(code === 0));
			});
			compiler = undefined;
			if (!passed || stopping) continue;
			await stopServer();
			if (!stopping) startServer();
		}
	} finally {
		building = false;
	}
}

const watchers = [api, packages].map((directory) =>
	watch(directory, { recursive: true }, (_event, filename) => {
		if (
			!filename ||
			/(^|\/)(node_modules|dist|\.turbo|\.git)(\/|$)/.test(filename)
		)
			return;
		if (directory === api && !/^(src\/|tsconfig\.json$)/.test(filename)) return;
		if (!/\.(ts|tsx|json)$/.test(filename)) return;
		void rebuild();
	}),
);

async function shutdown() {
	stopping = true;
	for (const watcher of watchers) watcher.close();
	compiler?.kill("SIGTERM");
	await stopServer();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
await rebuild();
