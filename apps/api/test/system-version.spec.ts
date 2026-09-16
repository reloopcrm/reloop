import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findWorkspaceRoot } from "@crm/env";
import { ConfigService } from "@nestjs/config";
import { isNewerVersion, parseSemver } from "../src/system/system.contracts";
import { SystemService } from "../src/system/system.service";

const realFetch = globalThis.fetch;
const realFlag = process.env.RELOOP_UPDATE_CHECK;

const root = findWorkspaceRoot(process.cwd());
if (!root) throw new Error("workspace root not found");
const current = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
	.version as string;

function service() {
	return new SystemService(new ConfigService());
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

afterEach(() => {
	globalThis.fetch = realFetch;
	if (realFlag === undefined) {
		delete process.env.RELOOP_UPDATE_CHECK;
	} else {
		process.env.RELOOP_UPDATE_CHECK = realFlag;
	}
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

		expect((await service().version()).current).toBe(current);
	});

	it("flags a newer release", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(200, release("v99.0.0"));

		const info = await service().version();

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

		const info = await service().version();

		expect(info.latest).toBe(current);
		expect(info.updateAvailable).toBe(false);
	});

	it("does not flag an older release", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(200, release("v0.0.1"));

		expect((await service().version()).updateAvailable).toBe(false);
	});

	it("answers null when GitHub refuses", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(403, JSON.stringify({ message: "rate limit" }));

		const info = await service().version();

		expect(info.current).toBe(current);
		expect(info.latest).toBeNull();
		expect(info.updateAvailable).toBe(false);
		expect(info.releaseUrl).toBeNull();
		expect(info.checkedAt).toBeNull();
	});

	it("answers null when the answer is unreadable", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		githubAnswers(200, "not json");

		expect((await service().version()).latest).toBeNull();
	});

	it("answers null when the network is down", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		globalThis.fetch = (async (
			_url: string | URL | Request,
			_init?: RequestInit,
		): Promise<Response> => {
			throw new TypeError("fetch failed");
		}) as typeof fetch;

		expect((await service().version()).latest).toBeNull();
	});

	it("serves the second call inside the window from memory", async () => {
		delete process.env.RELOOP_UPDATE_CHECK;
		const calls = githubAnswers(200, release("v99.0.0"));
		const system = service();

		await system.version();
		const info = await system.version();

		expect(calls()).toBe(1);
		expect(info.latest).toBe("99.0.0");
	});

	it("never calls GitHub when the operator turned the check off", async () => {
		process.env.RELOOP_UPDATE_CHECK = "false";
		const calls = githubAnswers(200, release("v99.0.0"));

		const info = await service().version();

		expect(calls()).toBe(0);
		expect(info).toEqual({
			current,
			latest: null,
			updateAvailable: false,
			releaseUrl: null,
			checkedAt: null,
			checkDisabled: true,
		});
	});
});
