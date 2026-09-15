export type OwnerPlan =
	| { action: "refuse"; reason: string }
	| { action: "create"; email: string; name: string }
	| { action: "set-password"; email: string; userId: string };

export function planOwner(input: {
	email: string | undefined;
	allowed: (email: string) => boolean;
	existingUserId: string | null;
}): OwnerPlan {
	const email = input.email?.trim().toLowerCase() ?? "";
	if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
		return {
			action: "refuse",
			reason:
				"Usage: printf '%s' 'the password' | bun scripts/create-owner.ts <email>",
		};
	}
	if (!input.allowed(email)) {
		return {
			action: "refuse",
			reason: `${email} is not in ALLOWED_SIGN_IN, so it could never sign in.`,
		};
	}
	if (input.existingUserId) {
		return { action: "set-password", email, userId: input.existingUserId };
	}
	return { action: "create", email, name: email.split("@")[0] ?? email };
}

export function passwordFromStdin(raw: string): string {
	return raw.replace(/\r?\n$/, "");
}

async function main(): Promise<void> {
	const { auth, PASSWORD_RULES, PasswordRefused, setPasswordFor } =
		await import("@crm/auth");
	const { isWorkspaceEmail } = await import("@crm/auth/workspace");
	const { db } = await import("@crm/db");

	const email = process.argv[2]?.trim().toLowerCase();
	const existing = email
		? await db.user.findFirst({ where: { email }, select: { id: true } })
		: null;

	const plan = planOwner({
		email,
		allowed: isWorkspaceEmail,
		existingUserId: existing?.id ?? null,
	});

	if (plan.action === "refuse") throw new Error(plan.reason);

	const password = passwordFromStdin(await Bun.stdin.text());
	if (password.length < PASSWORD_RULES.minLength) {
		throw new Error(
			`The password needs at least ${PASSWORD_RULES.minLength} characters.`,
		);
	}
	if (password.length > PASSWORD_RULES.maxLength) {
		throw new Error(
			`The password takes at most ${PASSWORD_RULES.maxLength} characters.`,
		);
	}

	const userId =
		plan.action === "set-password"
			? plan.userId
			: (
					await (
						await auth.$context
					).internalAdapter.createUser({
						email: plan.email,
						name: plan.name,
						emailVerified: true,
					})
				).id;

	try {
		await setPasswordFor(userId, password);
	} catch (error) {
		if (error instanceof PasswordRefused && error.reason === "sign-in-off") {
			throw new Error(
				'PASSWORD_SIGN_IN is not "1", so nobody could use the password.',
			);
		}
		throw error;
	}

	console.log(
		plan.action === "create"
			? `Owner ${plan.email} created.`
			: `Password set for ${plan.email}.`,
	);

	await db.$disconnect();
}

if (import.meta.main) await main();
