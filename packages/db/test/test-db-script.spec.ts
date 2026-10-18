import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prismaCommand } from "../scripts/test-db-prisma";

const SCRIPT = join(import.meta.dir, "..", "scripts", "test-db.ts");
const BASE_URL = "postgresql://preview:preview@localhost:5432";

let sandbox = "";
let workspace = "";

beforeAll(() => {
	sandbox = mkdtempSync(join(tmpdir(), "test-db-script-"));
	workspace = join(sandbox, "workspace");
	mkdirSync(join(workspace, "packages", "db"), { recursive: true });
	writeFileSync(
		join(workspace, "package.json"),
		JSON.stringify({ name: "fixture", workspaces: ["packages/*"] }),
	);
	writeFileSync(
		join(workspace, ".env"),
		`TEST_DATABASE_URL="${BASE_URL}/from_dotenv"\n`,
	);
});

afterAll(() => {
	rmSync(sandbox, { recursive: true, force: true });
});

function runScript(cwd: string, extra: Record<string, string> = {}) {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) env[key] = value;
	}
	delete env.TEST_DATABASE_URL;
	delete env.DATABASE_URL;

	const result = Bun.spawnSync(["bun", SCRIPT], {
		cwd,
		env: { ...env, ...extra },
	});

	return { status: result.exitCode, output: String(result.stderr) };
}

describe("db:test environment", () => {
	it("reads TEST_DATABASE_URL from the workspace root .env", () => {
		const result = runScript(join(workspace, "packages", "db"));

		expect(result.status).toBe(1);
		expect(result.output).toContain('names "from_dotenv"');
		expect(result.output).not.toContain("Neither TEST_DATABASE_URL");
	});

	it("lets an exported TEST_DATABASE_URL win over .env", () => {
		const result = runScript(workspace, {
			TEST_DATABASE_URL: `${BASE_URL}/exported`,
		});

		expect(result.output).toContain('names "exported"');
		expect(result.output).not.toContain("from_dotenv");
	});
});

describe("prismaCommand", () => {
	it("prefers the package-local binary", () => {
		const packageDir = join(sandbox, "pkg");
		mkdirSync(join(packageDir, "node_modules", ".bin"), { recursive: true });
		const binary = join(packageDir, "node_modules", ".bin", "prisma");
		writeFileSync(binary, "");

		expect(
			prismaCommand([packageDir, workspace], ["migrate", "deploy"]),
		).toEqual({ command: binary, args: ["migrate", "deploy"] });
	});

	it("uses the workspace binary when the package has none", () => {
		mkdirSync(join(workspace, "node_modules", ".bin"), { recursive: true });
		const binary = join(workspace, "node_modules", ".bin", "prisma");
		writeFileSync(binary, "");

		expect(
			prismaCommand([join(sandbox, "empty"), workspace], ["migrate", "deploy"])
				.command,
		).toBe(binary);
	});

	it("falls back to bunx when no binary exists", () => {
		expect(
			prismaCommand([join(sandbox, "none")], ["migrate", "deploy"]),
		).toEqual({ command: "bunx", args: ["prisma", "migrate", "deploy"] });
	});
});
