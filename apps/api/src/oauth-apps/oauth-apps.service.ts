import { canManageConnections } from "@crm/auth";
import { oauthRedirectUri } from "@crm/auth/oauth-apps";
import type { Db, Prisma } from "@crm/db";
import {
	OAUTH_APP_COLUMNS,
	OAUTH_APP_ENV_VARS,
	OAUTH_APP_SELECT,
	OAUTH_APPS,
	type OAuthAppRow,
	type OAuthProviderId,
	openOAuthAppSecret,
	sealOAuthAppSecret,
} from "@crm/db/oauth-apps";
import { maskKey, SETTINGS_ID } from "@crm/db/settings";
import { isHosted } from "@crm/db/tenant-context";
import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { AgentAccessService } from "../agent/agent-access.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	OAuthAppInput,
	OAuthAppRestart,
	OAuthAppStatus,
	SaveOAuthAppInput,
} from "./oauth-apps.contracts";

@Injectable()
export class OAuthAppsService {
	private readonly logger = new Logger(OAuthAppsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
	) {}

	async status(userId: string, input: OAuthAppInput): Promise<OAuthAppStatus> {
		const role = await this.access.assertMember(userId);
		const row = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: OAUTH_APP_SELECT,
		});

		return describeApp(input.provider, row, canManageConnections(role));
	}

	async save(
		userId: string,
		input: SaveOAuthAppInput,
	): Promise<OAuthAppRestart> {
		await this.assertManager(userId);

		await this.write(
			appSettingFields(input.provider, {
				clientId: input.clientId,
				clientSecret: sealOAuthAppSecret(input.clientSecret),
				tenantId: input.tenantId || null,
			}),
		);

		return this.restart(input.provider, "saved");
	}

	async remove(userId: string, input: OAuthAppInput): Promise<OAuthAppRestart> {
		await this.assertManager(userId);

		await this.write(
			appSettingFields(input.provider, {
				clientId: null,
				clientSecret: null,
				tenantId: null,
			}),
		);

		return this.restart(input.provider, "removed");
	}

	private write(fields: Prisma.AppSettingUpdateInput): Promise<unknown> {
		return this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: {
				...(fields as Omit<Prisma.AppSettingCreateInput, "id">),
				id: SETTINGS_ID,
			},
			update: fields,
		});
	}

	private restart(provider: OAuthProviderId, change: string): OAuthAppRestart {
		if (!restartsItself()) {
			this.logger.log({
				message: `The ${provider} sign-in credentials are ${change}. This install does not restart itself.`,
				provider,
			});

			return { status: "unavailable" };
		}

		this.logger.log({
			message: `The ${provider} sign-in credentials are ${change}. The API restarts to read them.`,
			provider,
			delayMs: OAUTH_APPS.restart.delayMs,
		});

		setTimeout(() => {
			process.kill(process.pid, "SIGTERM");
		}, OAUTH_APPS.restart.delayMs);

		return { status: "started" };
	}

	private async assertManager(userId: string): Promise<void> {
		const role = await this.access.assertMember(userId);

		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can change the sign-in credentials.",
			);
		}
	}
}

interface OAuthAppFields {
	clientId: string | null;
	clientSecret: string | null;
	tenantId: string | null;
}

function appSettingFields(
	provider: OAuthProviderId,
	values: OAuthAppFields,
): Prisma.AppSettingUpdateInput {
	const columns = OAUTH_APP_COLUMNS[provider];
	const fields: Prisma.AppSettingUpdateInput = {
		[columns.clientId]: values.clientId,
		[columns.clientSecret]: values.clientSecret,
	};
	if (columns.tenantId) fields[columns.tenantId] = values.tenantId;

	return fields;
}

function restartsItself(): boolean {
	return !process.env.VERCEL && !isHosted();
}

function describeApp(
	provider: OAuthProviderId,
	row: OAuthAppRow | null,
	canManage: boolean,
): OAuthAppStatus {
	const columns = OAUTH_APP_COLUMNS[provider];
	const names = OAUTH_APP_ENV_VARS[provider];

	const savedId = row?.[columns.clientId]?.trim() || null;
	const savedSecret = row?.[columns.clientSecret]?.trim() || null;
	const saved = Boolean(savedId && savedSecret);

	const environmentId = trimmedEnv(names.clientId);
	const environmentSecret = trimmedEnv(names.clientSecret);
	const environment = Boolean(environmentId && environmentSecret);

	const savedTenant = columns.tenantId
		? row?.[columns.tenantId]?.trim() || null
		: null;
	const environmentTenant = names.tenantId ? trimmedEnv(names.tenantId) : null;

	const clientId = saved ? savedId : environment ? environmentId : null;
	const secret = saved ? savedSecret : environmentSecret;

	return {
		provider,
		source: saved ? "database" : environment ? "environment" : "none",
		clientId: canManage ? clientId : null,
		secretHint: canManage && secret ? hintOf(saved, secret) : null,
		tenantId: canManage ? (saved ? savedTenant : environmentTenant) : null,
		redirectUri: oauthRedirectUri(provider),
		environmentAlso: saved && environment,
		canManage,
	};
}

function trimmedEnv(name: string): string | null {
	return process.env[name]?.trim() || null;
}

function hintOf(sealed: boolean, secret: string): string {
	if (!sealed) return maskKey(secret);

	try {
		return maskKey(openOAuthAppSecret(secret));
	} catch {
		return maskKey("");
	}
}
