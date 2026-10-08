import { type Db, db as defaultDb, type Prisma } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { canGrantSignIn, type WorkspaceRole } from "./roles";
import { isWorkspaceEmail } from "./workspace";

export const SIGN_IN_GRANTS = {
	maxAddresses: 200,
	maxAddressChars: 254,
} as const;

export function normalizeSignInAddress(
	email: string | null | undefined,
): string | null {
	const value = email?.trim().toLowerCase();
	if (!value || value.length > SIGN_IN_GRANTS.maxAddressChars) return null;
	if (/[\s,;*]/.test(value)) return null;

	const parts = value.split("@");
	if (parts.length !== 2) return null;

	const [local, host] = parts;
	if (!local || !host?.includes(".")) return null;

	return value;
}

export async function readSignInGrants(
	database: Db = defaultDb,
): Promise<readonly string[]> {
	const row = await database.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { signInAddresses: true },
	});

	return row?.signInAddresses ?? [];
}

export async function isSignInAllowed(
	email: string | null | undefined,
	database: Db = defaultDb,
): Promise<boolean> {
	if (isWorkspaceEmail(email)) return true;

	const address = normalizeSignInAddress(email);
	if (!address) return false;

	return (await readSignInGrants(database)).includes(address);
}

type GrantStore = Pick<Prisma.TransactionClient, "appSetting" | "$queryRaw">;

async function selectGrantsForUpdate(
	tx: GrantStore,
): Promise<readonly string[] | null> {
	const rows = await tx.$queryRaw<{ signInAddresses: string[] }[]>`
		SELECT "signInAddresses" FROM "appSetting"
		WHERE id = ${SETTINGS_ID}
		FOR UPDATE
	`;

	return rows[0]?.signInAddresses ?? null;
}

async function lockSignInGrants(tx: GrantStore): Promise<readonly string[]> {
	const granted = await selectGrantsForUpdate(tx);
	if (granted) return granted;

	await tx.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID },
		update: {},
	});

	return (await selectGrantsForUpdate(tx)) ?? [];
}

export async function grantSignIn(
	database: Db,
	email: string,
	role: WorkspaceRole | null,
): Promise<boolean> {
	if (isWorkspaceEmail(email)) return true;
	if (!canGrantSignIn(role)) return false;

	return database.$transaction((tx) =>
		grantSignInInTransaction(tx, email, role),
	);
}

export async function grantSignInInTransaction(
	tx: GrantStore,
	email: string,
	role: WorkspaceRole | null,
): Promise<boolean> {
	if (isWorkspaceEmail(email)) return true;
	if (!canGrantSignIn(role)) return false;

	const address = normalizeSignInAddress(email);
	if (!address) return false;

	const granted = await lockSignInGrants(tx);
	if (granted.includes(address)) return true;
	if (granted.length >= SIGN_IN_GRANTS.maxAddresses) return false;

	await tx.appSetting.update({
		where: { id: SETTINGS_ID },
		data: { signInAddresses: [...granted, address] },
	});

	return true;
}

export async function revokeSignIn(
	database: Db,
	email: string,
): Promise<boolean> {
	const address = normalizeSignInAddress(email);
	if (!address) return false;

	return database.$transaction(async (tx) => {
		const granted = await lockSignInGrants(tx);
		if (!granted.includes(address)) return false;

		await tx.appSetting.update({
			where: { id: SETTINGS_ID },
			data: { signInAddresses: granted.filter((entry) => entry !== address) },
		});

		const people = await tx.user.findMany({
			where: { email: { equals: address, mode: "insensitive" } },
			select: { id: true },
		});

		await endAccessOf(
			tx,
			people.map((person) => person.id),
		);

		return true;
	});
}

type CredentialStore = Pick<Db, "session" | "apikey">;

export async function endAccessOf(
	database: CredentialStore,
	userIds: readonly string[],
): Promise<void> {
	if (userIds.length === 0) return;

	await database.session.deleteMany({
		where: { userId: { in: [...userIds] } },
	});
	await database.apikey.deleteMany({
		where: { referenceId: { in: [...userIds] } },
	});
}
