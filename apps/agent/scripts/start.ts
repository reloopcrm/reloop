import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { constants } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rawPort = process.env.AGENT_PORT ?? process.env.PORT ?? "2000";
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error(
		`AGENT_PORT or PORT must be a valid port, received ${rawPort}.`,
	);
}

const host = "0.0.0.0";
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = resolve(appRoot, ".output", "server", "index.mjs");

if (!existsSync(server)) {
	throw new Error(
		`Missing agent build output at ${server}. Run "bun run build" first.`,
	);
}

const node = process.versions.bun ? "node" : process.execPath;
const child = spawn(node, [server], {
	cwd: appRoot,
	stdio: "inherit",
	env: {
		...process.env,
		HOST: host,
		NITRO_HOST: host,
		NITRO_PORT: String(port),
		PORT: String(port),
	},
});

let settled = false;

const finish = (code: number) => {
	if (settled) return;
	settled = true;
	process.exitCode = code;
};

const forward = (signal: NodeJS.Signals) => {
	if (!child.killed) child.kill(signal);
};

process.once("SIGINT", forward);
process.once("SIGTERM", forward);

child.once("exit", (code, signal) => {
	const signalNumber = signal ? constants.signals[signal] : null;
	finish(code ?? (signalNumber ? 128 + signalNumber : 1));
});

child.once("error", (error) => {
	console.error(`[agent] could not start the server: ${error.message}`);
	finish(1);
});
