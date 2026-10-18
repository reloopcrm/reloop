export function databaseName(url: string): string {
	try {
		return new URL(url).pathname.replace(/^\//, "");
	} catch {
		return url;
	}
}

export function isTestDatabaseName(name: string): boolean {
	return /^[a-zA-Z0-9_]+_test$/.test(name);
}

export function testDatabaseUrl(
	env: Record<string, string | undefined>,
): string {
	const url = env.TEST_DATABASE_URL?.trim();

	if (!url) {
		throw new Error(
			[
				"TEST_DATABASE_URL is not set.",
				"The suite writes rows, so it never falls back to DATABASE_URL.",
				"Set TEST_DATABASE_URL in the root .env, then run bun run db:test in packages/db.",
			].join(" "),
		);
	}

	const name = databaseName(url);

	if (!isTestDatabaseName(name)) {
		throw new Error(
			`TEST_DATABASE_URL names "${name}", which does not end in _test. The suite refuses anything else.`,
		);
	}

	return url;
}
