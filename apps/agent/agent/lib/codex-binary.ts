import { spawn as nodeSpawn } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { isHostedCustomer } from "@crm/db/tenant-context";
import { MODEL } from "./model-config";

export type CodexBinary =
	| { command: string; reason: null }
	| { command: null; reason: string };

export type CodexBinaryDeps = {
	home: string;
	searchPath: string;
	executable: (file: string) => boolean;
	install: (prefix: string, spec: string) => Promise<void>;
};

const NEEDS_INTERNET =
	"The Codex command line could not be downloaded. The agent needs internet access for the first ChatGPT login.";

function found(command: string): CodexBinary {
	return { command, reason: null };
}

function failed(reason: string): CodexBinary {
	return { command: null, reason };
}

export function createCodexBinary(deps: CodexBinaryDeps) {
	const { command, version } = MODEL.chatgptLogin;
	const prefix = join(deps.home, "cli");
	const cached = join(prefix, "node_modules", ".bin", command);
	let installing: Promise<CodexBinary> | null = null;

	function located(): string | null {
		const onPath = deps.searchPath
			.split(delimiter)
			.some((dir) => dir !== "" && deps.executable(join(dir, command)));
		if (onPath) return command;
		return deps.executable(cached) ? cached : null;
	}

	return (): Promise<CodexBinary> => {
		const known = located();
		if (known) return Promise.resolve(found(known));
		if (!installing) {
			installing = deps
				.install(prefix, `@openai/codex@${version}`)
				.then(() =>
					deps.executable(cached)
						? found(cached)
						: failed(
								`The Codex download finished, but ${cached} is not executable.`,
							),
				)
				.catch((error) =>
					failed(
						`${NEEDS_INTERNET} (${
							error instanceof Error ? error.message : String(error)
						})`,
					),
				)
				.finally(() => {
					installing = null;
				});
		}
		return installing;
	};
}

function npmReason(stderr: string, code: number | null): string {
	const npmCode = stderr.match(/^npm (?:error|ERR!) code (\S+)/m)?.[1];
	return npmCode ? `npm ${npmCode}` : `npm exited with code ${code}`;
}

function installWithNpm(prefix: string, spec: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = nodeSpawn(
			"npm",
			[
				"install",
				"--prefix",
				prefix,
				spec,
				"--ignore-scripts",
				"--no-audit",
				"--no-fund",
			],
			{ env: codexEnv(), stdio: ["ignore", "ignore", "pipe"] },
		);
		let stderr = "";
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
		}, MODEL.chatgptLogin.installTimeoutMs);
		timer.unref?.();
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code, signal) => {
			clearTimeout(timer);
			if (code === 0) return resolve();
			reject(
				new Error(
					signal
						? "the download took too long and was stopped"
						: npmReason(stderr, code),
				),
			);
		});
	});
}

export function codexEnv(
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const kept: NodeJS.ProcessEnv = {};

	for (const name of MODEL.chatgptLogin.passThroughEnv) {
		const value = env[name];
		if (value !== undefined) kept[name] = value;
	}

	kept.CODEX_HOME = codexHome(env);
	return kept;
}

export function codexHome(env: NodeJS.ProcessEnv = process.env): string {
	return env.CODEX_HOME?.trim() || join(homedir(), ".codex");
}

export function chatgptLoginExists(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (isHostedCustomer()) return false;
	return existsSync(join(codexHome(env), MODEL.chatgptLogin.authFile));
}

export const codexBinary = createCodexBinary({
	home: codexHome(),
	searchPath: process.env.PATH ?? "",
	executable: (file) => {
		try {
			accessSync(file, constants.X_OK);
			return true;
		} catch {
			return false;
		}
	},
	install: installWithNpm,
});
