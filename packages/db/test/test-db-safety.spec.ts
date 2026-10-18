import { expect, it } from "bun:test";

for (const scenario of ["--drift", "--diff-error", "--reset"]) {
	it(`stops database preparation without mutations for ${scenario}`, async () => {
		const child = Bun.spawn(
			[
				process.execPath,
				"--preload",
				new URL("./test-db-preload.ts", import.meta.url).pathname,
				new URL("../scripts/test-db.ts", import.meta.url).pathname,
				scenario,
			],
			{
				env: {
					...process.env,
					TEST_DATABASE_URL: "postgresql://test:test@127.0.0.1:1/crm_test",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		expect(code).toBe(1);
		expect(stdout + stderr).not.toContain("Unexpected");
		expect(stderr).toMatch(/stops|disabled/);
	});
}
