import { expect, it } from "bun:test";
import type { Db, Prisma } from "@crm/db";
import { auth } from "../src/auth";
import { setPasswordFor } from "../src/password";

it("changes a password in memory and preserves only the current session", async () => {
	let password = "";
	let revoked: Prisma.SessionDeleteManyArgs | undefined;
	const transaction = {
		account: {
			update: async ({ data }: { data: { password: string } }) => {
				password = data.password;
			},
		},
		session: {
			deleteMany: async (input: Prisma.SessionDeleteManyArgs) => {
				revoked = input;
			},
		},
	};
	const database = {
		user: { findUnique: async () => ({ id: "test-user" }) },
		account: { findFirst: async () => ({ id: "test-account" }) },
		$transaction: async (run: (tx: typeof transaction) => Promise<void>) =>
			run(transaction),
	} as unknown as Db;
	await setPasswordFor(
		"test-user",
		"new-test-password",
		"current-session",
		database,
	);
	expect(password).not.toBe("new-test-password");
	expect(
		await (await auth.$context).password.verify({
			hash: password,
			password: "new-test-password",
		}),
	).toBe(true);
	expect(revoked).toEqual({
		where: { userId: "test-user", id: { not: "current-session" } },
	});
});
