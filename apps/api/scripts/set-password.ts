import {
	PASSWORD_RULES,
	type PasswordRefusal,
	PasswordRefused,
	setPasswordFor,
} from "@crm/auth";
import { db } from "@crm/db";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
	throw new Error(
		"Usage: printf '%s' 'the password' | bun scripts/set-password.ts <email>",
	);
}

const password = await Bun.stdin.text();

const user = await db.user.findFirst({
	where: { email },
	select: { id: true, email: true },
});

if (!user) {
	throw new Error(`No user has the address ${email}.`);
}

const EXPLAIN = {
	"sign-in-off":
		'PASSWORD_SIGN_IN is not "1", so nobody could use the password. Set it in .env and restart the API.',
	"too-short": `The password needs at least ${PASSWORD_RULES.minLength} characters.`,
	"too-long": `The password takes at most ${PASSWORD_RULES.maxLength} characters.`,
	"no-user": `No user has the address ${email}.`,
} satisfies Record<PasswordRefusal, string>;

try {
	await setPasswordFor(user.id, password);
} catch (error) {
	if (error instanceof PasswordRefused) {
		throw new Error(EXPLAIN[error.reason] ?? error.reason);
	}
	throw error;
}

console.log(`Password set for ${user.email}.`);

await db.$disconnect();
