import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "@crm/db";
import { findWorkspaceRoot } from "@crm/env";
import { ConfigService } from "@nestjs/config";
import { isNewerVersion, parseSemver } from "../src/system/system.contracts";
import { SystemService } from "../src/system/system.service";

const realFetch = globalThis.fetch;
const realFlag = process.env.RELOOP_UPDATE_CHECK;
const realToken = process.env.UPDATER_TOKEN;
const realManaged = process.env.RELOOP_MANAGED;

const root = findWorkspaceRoot(process.cwd());
if (!root) throw new Error("workspace root not found");
const current = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	.version as string;

function service(role: string | null = "owner") {
	const db = {
		member: { findUnique: async () => (role ? { role } : null) },
	} as unknown as Db;
	return new SystemService(new ConfigService(), db);
}

function githubAnswers(status: number, body: string | null) {
	let calls = 0;
	globalThis.fetch = (async (
		_url: string | URL | Request,
		_init?: RequestInit,
	) => {
		calls += 1;
		return new Response(body, {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
	return () => calls;
}

function release(tag: string) {
	return JSON.stringify({
		tag_name: tag,
		html_url: `https://github.com/reloopcrm/reloop/releases/tag/${tag}`,
	});
}

function restore(name: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}

beforeEach(() => {
	delete process.env.UPDATER_TOKEN;
	delete process.env.RELOOP_MANAGED;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	restore("RELOOP_UPDATE_CHECK", realFlag);
	restore("UPDATER_TOKEN", realToken);
	restore("RELOOP_MANAGED", realManaged);
});

describe("semver compare", () => {
	it("parses a tag with or without the v prefix", () => {
		expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
		expect(parseSemver("10.0.1")).toEqual([10, 0, 1]);
		expect(parseSemver("v1.2.3-beta.1")).toBeNull();
		expect(parseSemver("latest")).toBeNull();
	});

	it("orders major, minor and patch numerically", () => {
		expect(isNewerVersion("v0.10.0", "0.9.9")).toBe(true);
		expect(isNewerVersion("v1.0.0", "0.9.9")).toBe(true);
		expect(isNewerVersion("v0.2.1", "0.2.0")).toBe(true);
		expect(isNewerVersion("v0.2.0", "0.2.0")).toBe(false);
		expect(isNewerVersion("v0.1.9", "0.2.0")).toBe(false);
		expect(isNewerVersion("v0.3.0-rc.1", "0.2.0")).toBe(false);
	});
});

describe("system.version", () => {
	it("reads the current version from the root package.json", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(200, release("v0.0.1"));

		expect((await service().version("owner")).current).toBe(current);
	});

	it("flags a newer release", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(200, release("v99.0.0"));

		const info = await service().version("owner");

		expect(info.latest).toBe("99.0.0");
		expect(info.updateAvailable).toBe(true);
		expect(info.releaseUrl).toBe(
			"https://github.com/reloopcrm/reloop/releases/tag/v99.0.0",
		);
		expect(info.checkedAt).not.toBeNull();
		expect(info.checkDisabled).toBe(false);
	});

	it("does not flag the release that is already running", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(200, release(`v${current}`));

		const info = await service().version("owner");

		expect(info.latest).toBe(current);
		expect(info.updateAvailable).toBe(false);
	});

	it("does not flag an older release", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(200, release("v0.0.1"));

		expect((await service().version("owner")).updateAvailable).toBe(false);
	});

	it("answers null when GitHub refuses", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(403, JSON.stringify({ message: "rate limit" }));

		const info = await service().version("owner");

		expect(info.current).toBe(current);
		expect(info.latest).toBeNull();
		expect(info.updateAvailable).toBe(false);
		expect(info.releaseUrl).toBeNull();
		expect(info.checkedAt).toBeNull();
	});

	it("answers null when the answer is unreadable", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(200, "not json");

		expect((await service().version("owner")).latest).toBeNull();
	});

	it("answers null when the network is down", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		globalThis.fetch = (async (
			_url: string | URL | Request,
			_init?: RequestInit,
		): Promise<Response> => {
			throw new TypeError("fetch failed");
		}) as typeof fetch;

		expect((await service().version("owner")).latest).toBeNull();
	});

	it("serves the second call inside the window from memory", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		const calls = githubAnswers(200, release("v99.0.0"));
		const system = service();

		await system.version("owner");
		const info = await system.version("owner");

		expect(calls()).toBe(1);
		expect(info.latest).toBe("99.0.0");
	});

	it("never calls GitHub when the operator turned the check off", async () => {
		process.env.RELOOP_UPDATE_CHECK = "false";
		const calls = githubAnswers(200, release("v99.0.0"));

		const info = await service().version("owner");

		expect(calls()).toBe(0);
		expect(info).toEqual({
			current,
			latest: null,
			updateAvailable: false,
			releaseUrl: null,
			checkedAt: null,
			checkDisabled: true,
			updaterAvailable: false,
		});
	});
});

type Call = { url: string; init?: RequestInit };

function updaterAnswers(answer: (call: Call) => Response | Error) {
	const calls: Call[] = [];
	globalThis.fetch = (async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		const call = { url: String(url), init };
		calls.push(call);
		const result = answer(call);
		if (result instanceof Error) throw result;
		return result;
	}) as typeof fetch;
	return calls;
}

const updaterOnly = (call: Call) =>
	call.url.startsWith("http://updater:8080/")
		? call.init?.headers
			? new Response(null, { status: 200 })
			: new Response(null, { status: 401 })
		: new Response(release("v99.0.0"), {
				status: 200,
				headers: { "content-type": "application/json" },
			});

describe("system.update", () => {
	it("answers unavailable without a token and never calls the updater", async () => {
		delete process.env.UPDATER_TOKEN;
		const calls = updaterAnswers(updaterOnly);

		expect(await service().update("owner")).toEqual({
			status: "unavailable",
		});
		expect(calls).toHaveLength(0);
	});

	it("refuses a non owner before reaching the updater", async () => {
		process.env.UPDATER_TOKEN = "secret";
		const calls = updaterAnswers(updaterOnly);

		expect(await service("admin").update("admin")).toEqual({
			status: "refused",
		});
		expect(await service(null).update("stranger")).toEqual({
			status: "refused",
		});
		expect(calls).toHaveLength(0);
	});

	it("starts the update with the token when the updater answers", async () => {
		process.env.UPDATER_TOKEN = "secret";
		const calls = updaterAnswers(updaterOnly);

		expect(await service().update("owner")).toEqual({ status: "started" });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("http://updater:8080/v1/update");
		expect(calls[0]?.init?.method).toBe("POST");
		expect(calls[0]?.init?.headers).toEqual({
			authorization: "Bearer secret",
		});
	});

	it("refuses on a managed install even when the updater answers", async () => {
		process.env.UPDATER_TOKEN = "secret";
		process.env.RELOOP_MANAGED = "true";
		const calls = updaterAnswers(updaterOnly);

		expect(await service().update("owner")).toEqual({ status: "refused" });
		expect(calls).toHaveLength(0);
	});

	it("treats a timeout as started because the updater restarts the API", async () => {
		process.env.UPDATER_TOKEN = "secret";
		updaterAnswers(() => new DOMException("timed out", "TimeoutError"));

		expect(await service().update("owner")).toEqual({ status: "started" });
	});

	it("answers unavailable when the updater is unreachable or refuses", async () => {
		process.env.UPDATER_TOKEN = "secret";
		updaterAnswers(() => new TypeError("fetch failed"));
		expect(await service().update("owner")).toEqual({
			status: "unavailable",
		});

		updaterAnswers(() => new Response(null, { status: 401 }));
		expect(await service().update("owner")).toEqual({
			status: "unavailable",
		});
	});
});

describe("system.version updaterAvailable", () => {
	it("is true for an owner when an update waits and the updater answers 401", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		process.env.UPDATER_TOKEN = "secret";
		updaterAnswers(updaterOnly);

		expect((await service().version("owner")).updaterAvailable).toBe(true);
	});

	it("is false for an admin, without a token, and when the updater is off", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		process.env.UPDATER_TOKEN = "secret";
		updaterAnswers(updaterOnly);
		expect((await service("admin").version("admin")).updaterAvailable).toBe(
			false,
		);

		delete process.env.UPDATER_TOKEN;
		const calls = updaterAnswers(updaterOnly);
		expect((await service().version("owner")).updaterAvailable).toBe(false);
		expect(
			calls.filter((call) => call.url.startsWith("http://updater")),
		).toHaveLength(0);

		process.env.UPDATER_TOKEN = "secret";
		updaterAnswers((call) =>
			call.url.startsWith("http://updater")
				? new TypeError("fetch failed")
				: updaterOnly(call),
		);
		expect((await service().version("owner")).updaterAvailable).toBe(false);
	});

	it("is false on a managed install", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		process.env.UPDATER_TOKEN = "secret";
		process.env.RELOOP_MANAGED = "true";
		const calls = updaterAnswers(updaterOnly);

		const info = await service().version("owner");

		expect(info.updateAvailable).toBe(true);
		expect(info.updaterAvailable).toBe(false);
		expect(calls).toHaveLength(1);
	});

	it("never probes the updater while no update waits", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		process.env.UPDATER_TOKEN = "secret";
		const calls = updaterAnswers((call) =>
			call.url.startsWith("http://updater")
				? new Response(null, { status: 401 })
				: new Response(release(`v${current}`), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
		);

		expect((await service().version("owner")).updaterAvailable).toBe(false);
		expect(calls).toHaveLength(1);
	});
});
