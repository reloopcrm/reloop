import { describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GENERATE_PLACEHOLDER_URL,
	generateCommand,
	generateEnv,
} from "../scripts/generate-client-env";

const GENERATE_TIMEOUT_MS = 60_000;
const DB_DIR = join(import.meta.dir, "..");
const SYSTEM_PATH = "/usr/bin:/bin";

function imageLikePath() {
	const dir = mkdtempSync(join(tmpdir(), "generate-client-"));
	const bin = join(dir, "bin");
	const home = join(dir, "home");
	mkdirSync(bin);
	mkdirSync(home);
	symlinkSync(process.execPath, join(bin, "bun"));
	return { dir, home, bun: join(bin, "bun"), path: `${bin}:${SYSTEM_PATH}` };
}

describe("generate-client environment", () => {
	it("adds a placeholder when DATABASE_URL is missing", () => {
		expect(generateEnv({ PATH: "/bin" }).DATABASE_URL).toBe(
			GENERATE_PLACEHOLDER_URL,
		);
	});

	it("adds a placeholder when DATABASE_URL is empty", () => {
		expect(generateEnv({ DATABASE_URL: "" }).DATABASE_URL).toBe(
			GENERATE_PLACEHOLDER_URL,
		);
	});

	it("keeps a real DATABASE_URL", () => {
		const url = "postgresql://preview:preview@localhost:5432/preview";
		expect(generateEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
	});

	it("runs prisma through the running bun binary, never bunx", () => {
		const command = generateCommand();
		expect(command).toEqual([process.execPath, "x", "prisma", "generate"]);
		expect(command).not.toContain("bunx");
	});

	it(
		"runs prisma generate without DATABASE_URL and without bunx on PATH",
		() => {
			const image = imageLikePath();
			try {
				const bunx = Bun.spawnSync(["sh", "-c", "command -v bunx"], {
					env: { PATH: image.path },
				});
				expect(bunx.exitCode).not.toBe(0);
				const result = Bun.spawnSync(
					[image.bun, "scripts/generate-client.ts"],
					{
						cwd: DB_DIR,
						env: { PATH: image.path, HOME: image.home },
					},
				);
				expect(result.stderr.toString()).not.toContain("bunx");
				expect(result.exitCode).toBe(0);
			} finally {
				rmSync(image.dir, { recursive: true, force: true });
			}
		},
		GENERATE_TIMEOUT_MS,
	);

	it.each(["build", "db:generate"])(
		"routes the %s script through generate-client",
		(name) => {
			const pkg = JSON.parse(
				readFileSync(join(DB_DIR, "package.json"), "utf8"),
			) as { scripts: Record<string, string> };
			expect(pkg.scripts[name]).toBe("bun scripts/generate-client.ts");
		},
	);

	it(
		"runs the build script without DATABASE_URL",
		() => {
			const image = imageLikePath();
			try {
				const result = Bun.spawnSync([image.bun, "run", "build"], {
					cwd: DB_DIR,
					env: { PATH: image.path, HOME: image.home },
				});
				expect(result.stderr.toString()).not.toContain("DATABASE_URL");
				expect(result.exitCode).toBe(0);
			} finally {
				rmSync(image.dir, { recursive: true, force: true });
			}
		},
		GENERATE_TIMEOUT_MS,
	);
});
