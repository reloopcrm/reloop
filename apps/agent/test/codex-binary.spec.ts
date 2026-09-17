import { describe, expect, it, mock } from "bun:test";
import {
	type CodexBinaryDeps,
	codexEnv,
	createCodexBinary,
} from "../agent/lib/codex-binary";
import { MODEL } from "../agent/lib/model-config";

const HOME = "/data/codex";
const CACHED = `${HOME}/cli/node_modules/.bin/codex`;

function harness(
	present: Set<string>,
	install: CodexBinaryDeps["install"] = async () => {
		present.add(CACHED);
	},
) {
	const installs = mock(install);
	const deps: CodexBinaryDeps = {
		home: HOME,
		searchPath: "/usr/local/bin:/usr/bin",
		executable: (file) => present.has(file),
		install: installs,
	};
	return { resolve: createCodexBinary(deps), installs };
}

describe("finding the codex binary", () => {
	it("uses the binary on PATH when there is one", async () => {
		const { resolve, installs } = harness(new Set(["/usr/bin/codex"]));

		expect(await resolve()).toEqual({ command: "codex", reason: null });
		expect(installs).not.toHaveBeenCalled();
	});

	it("uses the cached copy under CODEX_HOME when there is one", async () => {
		const { resolve, installs } = harness(new Set([CACHED]));

		expect(await resolve()).toEqual({ command: CACHED, reason: null });
		expect(installs).not.toHaveBeenCalled();
	});

	it("installs once when nothing is there", async () => {
		const { resolve, installs } = harness(new Set());

		expect(await resolve()).toEqual({ command: CACHED, reason: null });
		expect(await resolve()).toEqual({ command: CACHED, reason: null });
		expect(installs).toHaveBeenCalledTimes(1);
		expect(installs).toHaveBeenCalledWith(
			`${HOME}/cli`,
			`@openai/codex@${MODEL.chatgptLogin.version}`,
		);
	});

	it("runs one install for two parallel callers", async () => {
		const present = new Set<string>();
		const { resolve, installs } = harness(present, async () => {
			await Bun.sleep(10);
			present.add(CACHED);
		});

		const results = await Promise.all([resolve(), resolve()]);

		expect(results).toEqual([
			{ command: CACHED, reason: null },
			{ command: CACHED, reason: null },
		]);
		expect(installs).toHaveBeenCalledTimes(1);
	});

	it("reports a failed install instead of throwing", async () => {
		const { resolve } = harness(new Set(), async () => {
			throw new Error("npm ENOTFOUND");
		});

		const result = await resolve();

		expect(result.command).toBeNull();
		expect(result.reason).toContain("internet access");
		expect(result.reason).toContain("npm ENOTFOUND");
	});

	it("reports an install that left no executable behind", async () => {
		const { resolve } = harness(new Set(), async () => {});

		expect((await resolve()).reason).toContain(CACHED);
	});
});

describe("what the codex install is allowed to read", () => {
	it("hands over the paths it needs and nothing else", () => {
		const scrubbed = codexEnv({
			AGENT_BRIDGE_SECRET: "bridge",
			CODEX_HOME: HOME,
			DATABASE_URL: "postgresql://user:pass@postgres:5432/reloop",
			HOME: "/home/node",
			OPENROUTER_API_KEY: "sk-secret",
			PATH: "/usr/local/bin:/usr/bin",
		});

		expect(scrubbed).toEqual({
			CODEX_HOME: HOME,
			HOME: "/home/node",
			PATH: "/usr/local/bin:/usr/bin",
		});
	});

	it("names the codex home even when the container did not", () => {
		expect(codexEnv({}).CODEX_HOME?.endsWith(".codex")).toBe(true);
	});
});
