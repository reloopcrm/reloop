import { db } from "@crm/db/client";
import {
	OAUTH_APP_ENV_VARS,
	OAUTH_APP_REDIRECT_PATHS,
	OAUTH_APP_SELECT,
	OAUTH_APPS,
	type OAuthAppRow,
	type OAuthProviderId,
	storedOAuthApp,
} from "@crm/db/oauth-apps";
import { SETTINGS_ID } from "@crm/db/settings";
import { isHosted } from "@crm/db/tenant-context";
import { apiUrl, rememberStoredEnv } from "./env";

export function oauthRedirectUri(provider: OAuthProviderId): string {
	return new URL(OAUTH_APP_REDIRECT_PATHS[provider], apiUrl).toString();
}

export async function loadStoredOAuthApps(): Promise<void> {
	if (isHosted()) return;

	const row = await readRow();
	if (!row) return;

	const values = new Map<string, string>();

	for (const provider of OAUTH_APPS.providers) {
		const names = OAUTH_APP_ENV_VARS[provider];

		try {
			const app = storedOAuthApp(row, provider);
			if (!app) continue;

			values.set(names.clientId, app.clientId);
			values.set(names.clientSecret, app.clientSecret);
			if (names.tenantId && app.tenantId) {
				values.set(names.tenantId, app.tenantId);
			}
		} catch (cause: unknown) {
			warn(`The saved ${provider} credentials cannot be opened.`, cause);
		}
	}

	rememberStoredEnv(values);
}

async function readRow(): Promise<OAuthAppRow | null> {
	try {
		return await db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: OAUTH_APP_SELECT,
		});
	} catch (cause: unknown) {
		warn("The saved sign-in credentials cannot be read.", cause);
		return null;
	}
}

function warn(message: string, cause: unknown): void {
	const detail = cause instanceof Error ? cause.message : String(cause);
	console.warn(`${message} The environment decides instead. ${detail}`);
}
