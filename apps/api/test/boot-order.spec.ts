import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const entry = new URL("../dist/main.js", import.meta.url).pathname;

it("builds the auth instance after the saved credentials are read", () => {
	const source = readFileSync(entry, "utf8");
	const imports = [...source.matchAll(/^import[\s\S]*?from\s+"([^"]+)";$/gm)]
		.map((match) => match[1])
		.filter((specifier) => specifier?.startsWith("@crm/auth"));

	expect(imports).toEqual(["@crm/auth/oauth-apps"]);
	expect(source).toContain("loadStoredOAuthApps");
	expect(source).toMatch(/await import\("\.\/create-app/);
});
