import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODEL } from "../agent/lib/model-config";

export type FakeCodexHome = { home: string; restore: () => void };

export function fakeCodexHome(loggedIn: boolean): FakeCodexHome {
	const previous = process.env.CODEX_HOME;
	const home = mkdtempSync(join(tmpdir(), "codex-home-"));
	if (loggedIn) {
		writeFileSync(
			join(home, MODEL.chatgptLogin.authFile),
			JSON.stringify({ tokens: { access_token: "test" } }),
		);
	}
	process.env.CODEX_HOME = home;

	return {
		home,
		restore: () => {
			if (previous === undefined) delete process.env.CODEX_HOME;
			else process.env.CODEX_HOME = previous;
			rmSync(home, { recursive: true, force: true });
		},
	};
}
