import { type ChildProcess, spawn as nodeSpawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import type {
	ChatgptLoginState,
	ChatgptLoginStatus,
} from "@crm/validation/chatgpt-login";
import {
	type CodexBinary,
	chatgptLoginExists,
	codexBinary,
	codexEnv,
} from "./codex-binary";
import { MODEL } from "./model-config";

export type { ChatgptLoginState, ChatgptLoginStatus };

type Spawn = (command: string, args: string[]) => ChildProcess;

export type ChatgptLoginDeps = {
	spawn: Spawn;
	codex: () => Promise<CodexBinary>;
	loginExists: () => boolean;
	markConnected: () => Promise<void>;
	replyMs: number;
	timeoutMs: number;
	statusTimeoutMs: number;
	killGraceMs: number;
};

const NOT_INSTALLED =
	"The Codex command line is not installed on the machine that runs the agent.";

function state(
	status: ChatgptLoginStatus,
	extra: Partial<ChatgptLoginState> = {},
): ChatgptLoginState {
	return {
		status,
		url: null,
		code: null,
		alreadyLoggedIn: false,
		reason: null,
		pollMs: MODEL.chatgptLogin.pollMs,
		...extra,
	};
}

export function parseDeviceLogin(output: string) {
	const text = stripVTControlCharacters(output);
	const url = text.match(/https:\/\/\S+/)?.[0] ?? null;
	const code =
		text.match(/one-time code[^\n]*\n\s*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1] ??
		text.match(/\b[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+\b/)?.[0] ??
		null;
	return { url, code };
}

function spawnSafely(
	spawn: Spawn,
	command: string,
	args: string[],
): ChildProcess | null {
	try {
		return spawn(command, args);
	} catch {
		return null;
	}
}

function terminate(child: ChildProcess, graceMs: number): void {
	child.kill("SIGTERM");
	setTimeout(() => {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
		}
	}, graceMs).unref?.();
}

function loginStatus(
	deps: ChatgptLoginDeps,
	command: string,
): Promise<"chatgpt" | "other" | "missing"> {
	return new Promise((resolve) => {
		const child = spawnSafely(deps.spawn, command, ["login", "status"]);
		if (!child) return resolve("missing");

		let output = "";
		const collect = (chunk: Buffer | string) => {
			output += chunk.toString();
		};
		child.stdout?.on("data", collect);
		child.stderr?.on("data", collect);

		const timer = setTimeout(() => {
			terminate(child, deps.killGraceMs);
			resolve("other");
		}, deps.statusTimeoutMs);

		child.on("error", () => {
			clearTimeout(timer);
			resolve("missing");
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve(
				code === 0 && /logged in using chatgpt/i.test(output)
					? "chatgpt"
					: "other",
			);
		});
	});
}

export function createChatgptLogin(deps: ChatgptLoginDeps) {
	let current = state("idle");
	let child: ChildProcess | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let starting: Promise<ChatgptLoginState> | null = null;
	let cancelledWhileStarting = false;

	function stop(next: ChatgptLoginState) {
		current = next;
		if (timer) clearTimeout(timer);
		timer = null;
		const running = child;
		child = null;
		if (running) terminate(running, deps.killGraceMs);
	}

	async function connect(alreadyLoggedIn: boolean) {
		try {
			await deps.markConnected();
			current = state("connected", { alreadyLoggedIn });
		} catch (error) {
			console.error(
				`[agent] the ChatGPT login worked but the provider could not be saved: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			current = state("failed", {
				reason:
					"The login worked, but the setting could not be saved. Try again.",
			});
		}
	}

	async function begin(): Promise<ChatgptLoginState> {
		const codex = await deps.codex();
		if (cancelledWhileStarting) return current;
		if (codex.command === null) {
			current = state("unavailable", { reason: codex.reason });
			return current;
		}
		const already = await loginStatus(deps, codex.command);
		if (cancelledWhileStarting) return current;
		if (already === "missing") {
			current = state("unavailable", { reason: NOT_INSTALLED });
			return current;
		}
		if (already === "chatgpt") {
			await connect(true);
			return current;
		}

		const proc = spawnSafely(deps.spawn, codex.command, [
			"login",
			"--device-auth",
		]);
		if (!proc) {
			current = state("unavailable", { reason: NOT_INSTALLED });
			return current;
		}

		child = proc;
		current = state("waiting");
		let output = "";

		const collect = (chunk: Buffer | string) => {
			if (child !== proc) return;
			output += chunk.toString();
			current = state("waiting", parseDeviceLogin(output));
		};
		proc.stdout?.on("data", collect);
		proc.stderr?.on("data", collect);

		proc.on("error", (error: NodeJS.ErrnoException) => {
			if (child !== proc) return;
			stop(
				error.code === "ENOENT"
					? state("unavailable", { reason: NOT_INSTALLED })
					: state("failed", { reason: "The Codex login could not start." }),
			);
		});

		proc.on("close", (code) => {
			if (child !== proc) return;
			if (timer) clearTimeout(timer);
			timer = null;
			child = null;
			if (code === 0) {
				void connect(false);
				return;
			}
			current = state("failed", {
				reason: "The ChatGPT login did not finish. Start it again.",
			});
		});

		timer = setTimeout(() => {
			if (child !== proc) return;
			stop(state("timeout"));
		}, deps.timeoutMs);

		return current;
	}

	return {
		status(): ChatgptLoginState {
			if (current.status === "idle" && deps.loginExists()) {
				return state("connected", { alreadyLoggedIn: true });
			}
			return current;
		},

		async start(): Promise<ChatgptLoginState> {
			if (child) return current;
			cancelledWhileStarting = false;
			current = state("waiting");
			if (!starting) {
				starting = begin().finally(() => {
					starting = null;
				});
			}
			const reply = new Promise<ChatgptLoginState>((resolve) => {
				setTimeout(() => resolve(current), deps.replyMs).unref?.();
			});
			return Promise.race([starting, reply]);
		},

		cancel(): ChatgptLoginState {
			if (starting && !child) {
				cancelledWhileStarting = true;
				current = state("cancelled");
				return current;
			}
			if (child || current.status === "waiting") stop(state("cancelled"));
			return current;
		},
	};
}

export const chatgptLogin = createChatgptLogin({
	spawn: (command, args) =>
		nodeSpawn(command, args, {
			env: codexEnv(),
			stdio: ["ignore", "pipe", "pipe"],
		}),
	codex: codexBinary,
	loginExists: chatgptLoginExists,
	markConnected: async () => {
		const [{ db }, { writeAgentProvider }, { forgetProviderCache }] =
			await Promise.all([
				import("@crm/db"),
				import("@crm/db/settings"),
				import("./model"),
			]);
		await writeAgentProvider(db, { provider: "chatgpt" });
		forgetProviderCache();
	},
	replyMs: MODEL.chatgptLogin.replyMs,
	timeoutMs: MODEL.chatgptLogin.timeoutMs,
	statusTimeoutMs: MODEL.chatgptLogin.statusTimeoutMs,
	killGraceMs: MODEL.chatgptLogin.killGraceMs,
});
