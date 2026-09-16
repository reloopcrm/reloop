import { describe, expect, it, mock } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	type ChatgptLoginDeps,
	createChatgptLogin,
	parseDeviceLogin,
} from "../agent/lib/chatgpt-login";
import type { CodexBinary } from "../agent/lib/codex-binary";
import {
	classifyProviderKey,
	verifyProviderKey,
} from "../agent/lib/provider-key";

const DEVICE_OUTPUT = `Welcome to Codex [v0.154.0]
OpenAI's command-line coding agent

Follow these steps to sign in with ChatGPT using device code authorization:

1. Open this link in your browser and sign in to your account
 [1mhttps://auth.openai.com/codex/device[0m

2. Enter this one-time code (expires in 15 minutes)
 [1mBQRT-WXKZ[0m
`;

type FakeChild = ChildProcess & {
	emitOut: (text: string) => void;
	exit: (code: number | null, signal?: NodeJS.Signals | null) => void;
	signals: string[];
};

function fakeChild(options: { ignoreSigterm?: boolean } = {}): FakeChild {
	const child = new EventEmitter() as FakeChild;
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	Object.assign(child, {
		stdout,
		stderr,
		signals: [],
		exitCode: null,
		signalCode: null,
	});
	child.emitOut = (text) => stdout.emit("data", Buffer.from(text));
	child.exit = (code, signal = null) => {
		Object.assign(child, { exitCode: code, signalCode: signal });
		child.emit("close", code, signal);
	};
	child.kill = mock((signal?: NodeJS.Signals | number) => {
		const name = String(signal ?? "SIGTERM");
		child.signals.push(name);
		if (name === "SIGTERM" && options.ignoreSigterm) return true;
		queueMicrotask(() => child.exit(null, name as NodeJS.Signals));
		return true;
	}) as unknown as ChildProcess["kill"];
	return child;
}

function harness(
	statusOutput: { code: number; text: string },
	overrides: {
		login?: FakeChild;
		statusDelayMs?: number;
		codex?: () => Promise<CodexBinary>;
	} = {},
) {
	const login = overrides.login ?? fakeChild();
	const calls: string[][] = [];
	const markConnected = mock(async () => {});
	const deps: ChatgptLoginDeps = {
		spawn: (_command, args) => {
			calls.push(args);
			if (args[1] === "status") {
				const status = fakeChild();
				setTimeout(() => {
					status.emitOut(statusOutput.text);
					status.exit(statusOutput.code);
				}, overrides.statusDelayMs ?? 0);
				return status;
			}
			return login;
		},
		codex:
			overrides.codex ?? (async () => ({ command: "codex", reason: null })),
		markConnected,
		replyMs: 20,
		timeoutMs: 50,
		statusTimeoutMs: 1_000,
		killGraceMs: 30,
	};
	return { flow: createChatgptLogin(deps), login, calls, markConnected };
}

const notLoggedIn = { code: 1, text: "Not logged in\n" };

describe("ChatGPT device login", () => {
	it("reads the link and the code from the codex output", () => {
		expect(parseDeviceLogin(DEVICE_OUTPUT)).toEqual({
			url: "https://auth.openai.com/codex/device",
			code: "BQRT-WXKZ",
		});
		expect(parseDeviceLogin("Starting...")).toEqual({ url: null, code: null });
	});

	it("shows the code while waiting and connects when codex exits cleanly", async () => {
		const { flow, login, markConnected } = harness(notLoggedIn);

		expect((await flow.start()).status).toBe("waiting");
		login.emitOut(DEVICE_OUTPUT);
		expect(flow.status()).toMatchObject({
			status: "waiting",
			url: "https://auth.openai.com/codex/device",
			code: "BQRT-WXKZ",
		});

		login.exit(0);
		await Bun.sleep(0);

		expect(markConnected).toHaveBeenCalledTimes(1);
		expect(flow.status()).toMatchObject({
			status: "connected",
			alreadyLoggedIn: false,
		});
	});

	it("kills the process when the login times out", async () => {
		const { flow, login, markConnected } = harness(notLoggedIn);

		await flow.start();
		await Bun.sleep(80);

		expect(login.signals).toContain("SIGTERM");
		expect(flow.status().status).toBe("timeout");
		expect(markConnected).not.toHaveBeenCalled();
	});

	it("sends SIGKILL when codex ignores SIGTERM", async () => {
		const stubborn = fakeChild({ ignoreSigterm: true });
		const { flow } = harness(notLoggedIn, { login: stubborn });

		await flow.start();
		await Bun.sleep(60);
		expect(stubborn.signals).toEqual(["SIGTERM"]);

		await Bun.sleep(50);
		expect(stubborn.signals).toEqual(["SIGTERM", "SIGKILL"]);
		expect(flow.status().status).toBe("timeout");
	});

	it("does not send SIGKILL when codex stops on SIGTERM", async () => {
		const { flow, login } = harness(notLoggedIn);

		await flow.start();
		flow.cancel();
		await Bun.sleep(60);

		expect(login.signals).toEqual(["SIGTERM"]);
	});

	it("kills the process on cancel", async () => {
		const { flow, login } = harness(notLoggedIn);

		await flow.start();
		expect(flow.cancel().status).toBe("cancelled");
		expect(login.signals).toContain("SIGTERM");
	});

	it("does not start the device login when cancelled during the status check", async () => {
		const { flow, calls, markConnected } = harness(notLoggedIn, {
			statusDelayMs: 20,
		});

		const started = flow.start();
		await Bun.sleep(5);
		expect(flow.cancel().status).toBe("cancelled");

		expect((await started).status).toBe("cancelled");
		expect(calls).toEqual([["login", "status"]]);
		expect(flow.status().status).toBe("cancelled");
		expect(markConnected).not.toHaveBeenCalled();
	});

	it("skips the device login when codex is already signed in with ChatGPT", async () => {
		const { flow, calls, markConnected } = harness({
			code: 0,
			text: "Logged in using ChatGPT\n",
		});

		expect(await flow.start()).toMatchObject({
			status: "connected",
			alreadyLoggedIn: true,
		});
		expect(calls).toEqual([["login", "status"]]);
		expect(markConnected).toHaveBeenCalledTimes(1);
	});

	it("does not treat an API key login as a subscription", async () => {
		const { flow, calls } = harness({
			code: 0,
			text: "Logged in using an API key\n",
		});

		expect((await flow.start()).status).toBe("waiting");
		expect(calls[1]).toEqual(["login", "--device-auth"]);
		flow.cancel();
	});

	it("reports a missing codex binary instead of throwing", async () => {
		const flow = createChatgptLogin({
			spawn: () => {
				const child = fakeChild();
				queueMicrotask(() =>
					child.emit(
						"error",
						Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" }),
					),
				);
				return child;
			},
			codex: async () => ({ command: "codex", reason: null }),
			markConnected: async () => {},
			replyMs: 20,
			timeoutMs: 50,
			statusTimeoutMs: 1_000,
			killGraceMs: 30,
		});

		expect((await flow.start()).status).toBe("unavailable");
	});

	it("answers waiting while codex is still being installed", async () => {
		const { flow, calls } = harness(notLoggedIn, {
			codex: async () => {
				await Bun.sleep(60);
				return { command: "codex", reason: null };
			},
		});

		expect((await flow.start()).status).toBe("waiting");
		expect(calls).toEqual([]);

		await Bun.sleep(70);
		expect(calls[1]).toEqual(["login", "--device-auth"]);
		flow.cancel();
	});

	it("reports a failed codex install as unavailable with its reason", async () => {
		const { flow, calls } = harness(notLoggedIn, {
			codex: async () => ({ command: null, reason: "No internet." }),
		});

		expect(await flow.start()).toMatchObject({
			status: "unavailable",
			reason: "No internet.",
		});
		expect(calls).toEqual([]);
	});
});

describe("checking a provider key", () => {
	it("maps 401 to invalid", () => {
		expect(classifyProviderKey("openai", { status: 401 }).outcome).toBe(
			"invalid",
		);
	});

	it("accepts any other answer", () => {
		for (const status of [200, 403, 429, 500]) {
			expect(classifyProviderKey("anthropic", { status }).outcome).toBe(
				"valid",
			);
		}
	});

	it("maps a network failure to unknown", async () => {
		const failing = (async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof fetch;

		expect(
			(await verifyProviderKey("openai", "sk-test", failing)).outcome,
		).toBe("unknown");
	});

	it("sends the candidate key to the provider", async () => {
		const seen: Headers[] = [];
		const answering = (async (_url: string, init: RequestInit) => {
			seen.push(new Headers(init.headers));
			return new Response(null, { status: 401 });
		}) as unknown as typeof fetch;

		expect(
			(await verifyProviderKey("anthropic", "sk-ant-test", answering)).outcome,
		).toBe("invalid");
		expect(seen[0]?.get("x-api-key")).toBe("sk-ant-test");
	});
});
