import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
	GENERATE_PLACEHOLDER_URL,
	generateEnv,
} from "../scripts/generate-client-env";

const DB_DIR = join(import.meta.dir, "..");

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

	it("runs prisma generate without DATABASE_URL", () => {
		const env: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (value !== undefined && key !== "DATABASE_URL") env[key] = value;
		}
		const result = Bun.spawnSync(["bun", "scripts/generate-client.ts"], {
			cwd: DB_DIR,
			env,
		});
		expect(result.exitCode).toBe(0);
	});
});
