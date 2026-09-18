import { type Db, db as defaultDb } from "@crm/db";
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

export async function grantSignIn(
	database: Db,
	email: string,
	role: WorkspaceRole | null,
): Promise<boolean> {
	if (isWorkspaceEmail(email)) return true;
	if (!canGrantSignIn(role)) return false;

	const address = normalizeSignInAddress(email);
	if (!address) return false;

	const granted = await readSignInGrants(database);
	if (granted.includes(address)) return true;
	if (granted.length >= SIGN_IN_GRANTS.maxAddresses) return false;

	const signInAddresses = [...granted, address];

	await database.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, signInAddresses },
		update: { signInAddresses },
	});

	return true;
}

export async function revokeSignIn(
	database: Db,
	email: string,
): Promise<boolean> {
	const address = normalizeSignInAddress(email);
	if (!address) return false;

	const granted = await readSignInGrants(database);
	if (!granted.includes(address)) return false;

	await database.appSetting.update({
		where: { id: SETTINGS_ID },
		data: { signInAddresses: granted.filter((entry) => entry !== address) },
	});

	return true;
}
