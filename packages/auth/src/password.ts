import { type Db, db, type Prisma } from "@crm/db";
import { auth } from "./auth";
import { env } from "./env";
import { PASSWORD_RULES } from "./password-rules";

export const CREDENTIAL_PROVIDER_ID = "credential";

export type PasswordRefusal =
	| "sign-in-off"
	| "too-short"
	| "too-long"
	| "no-user";

export class PasswordRefused extends Error {
	constructor(readonly reason: PasswordRefusal) {
		super(reason);
		this.name = "PasswordRefused";
	}
}

export function generatePassword(): string {
	return Buffer.from(
		crypto.getRandomValues(new Uint8Array(PASSWORD_RULES.generatedBytes)),
	).toString("base64url");
}

export async function hasPassword(userId: string): Promise<boolean> {
	const row = await db.account.findFirst({
		where: { userId, providerId: CREDENTIAL_PROVIDER_ID },
		select: { id: true },
	});

	return row !== null;
}

export async function verifyPasswordFor(
	userId: string,
	password: string,
): Promise<boolean> {
	const row = await db.account.findFirst({
		where: { userId, providerId: CREDENTIAL_PROVIDER_ID },
		select: { password: true },
	});
	if (!row?.password) return false;

	const context = await auth.$context;

	return context.password.verify({ hash: row.password, password });
}

export async function hashPassword(password: string): Promise<string> {
	if (!env.password) throw new PasswordRefused("sign-in-off");
	if (password.length < PASSWORD_RULES.minLength) {
		throw new PasswordRefused("too-short");
	}
	if (password.length > PASSWORD_RULES.maxLength) {
		throw new PasswordRefused("too-long");
	}

	const context = await auth.$context;

	return context.password.hash(password);
}

export async function writeCredentialAccount(
	tx: Prisma.TransactionClient,
	userId: string,
	hash: string,
): Promise<void> {
	const existing = await tx.account.findFirst({
		where: { userId, providerId: CREDENTIAL_PROVIDER_ID },
		select: { id: true },
	});

	if (existing) {
		await tx.account.update({
			where: { id: existing.id },
			data: { password: hash },
		});
		return;
	}

	await tx.account.create({
		data: {
			id: `${CREDENTIAL_PROVIDER_ID}-${userId}`,
			accountId: userId,
			providerId: CREDENTIAL_PROVIDER_ID,
			userId,
			password: hash,
			updatedAt: new Date(),
		},
	});
}

export async function setPasswordFor(
	userId: string,
	password: string,
	keepSessionId?: string,
	database: Db = db,
): Promise<void> {
	const hash = await hashPassword(password);

	const user = await database.user.findUnique({
		where: { id: userId },
		select: { id: true },
	});
	if (!user) throw new PasswordRefused("no-user");

	await database.$transaction(async (tx) => {
		await writeCredentialAccount(tx, userId, hash);
		await tx.session.deleteMany({
			where: {
				userId,
				id: keepSessionId ? { not: keepSessionId } : undefined,
			},
		});
	});
}
