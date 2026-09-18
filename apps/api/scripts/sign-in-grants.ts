async function main(): Promise<void> {
	const { readSignInGrants, revokeSignIn } = await import(
		"@crm/auth/sign-in-grants"
	);
	const { db } = await import("@crm/db");

	const command = process.argv[2];
	const email = process.argv[3];

	if (command === "list") {
		const granted = await readSignInGrants(db);
		console.log(
			granted.length === 0 ? "No address is granted." : granted.join("\n"),
		);
	} else if (command === "revoke" && email) {
		const removed = await revokeSignIn(db, email);
		console.log(
			removed
				? `${email} is no longer granted. Take it off ALLOWED_SIGN_IN as well.`
				: `${email} was not granted. ALLOWED_SIGN_IN decides on its own.`,
		);
	} else {
		console.error(
			"Usage: bun apps/api/scripts/sign-in-grants.ts list|revoke <email>",
		);
		process.exitCode = 1;
	}

	await db.$disconnect();
}

if (import.meta.main) await main();
