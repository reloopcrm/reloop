import { isSealedToken, openToken, resealToken } from "@crm/auth/token-seal";
import { OAUTH_APPS } from "@crm/db/oauth-apps";
import {
	isSealedSecret,
	openSecret,
	sealSecret,
	secretKey,
} from "@crm/db/secrets";
import { SLACK_USER_TOKEN } from "@crm/db/slack-inventory";
import { TYPESAFE } from "@crm/db/typesafe";
import { WEBHOOKS } from "@crm/db/webhooks";
import pg from "pg";
import { z } from "zod";
import { IMAP_CREDENTIALS } from "../imap/imap-credentials";
import { SETTINGS } from "../settings/settings.config";
import { IMPORT } from "./tenancy.config";

export type SealedField = {
	table: string;
	column: string;
	key: string;
	scheme: "app" | "better-auth";
	purpose: string | null;
};

const app = (
	table: string,
	column: string,
	purpose: string,
	key = "id",
): SealedField => ({ table, column, key, scheme: "app", purpose });

const betterAuth = (table: string, column: string): SealedField => ({
	table,
	column,
	key: "id",
	scheme: "better-auth",
	purpose: null,
});

export const SEALED_FIELDS: readonly SealedField[] = [
	app("appSetting", "agentOpenrouterKey", SETTINGS.providerKeys.purpose),
	app("appSetting", "agentOpenaiKey", SETTINGS.providerKeys.purpose),
	app("appSetting", "agentAnthropicKey", SETTINGS.providerKeys.purpose),
	app("appSetting", "typesafeApiKey", TYPESAFE.purpose),
	app("appSetting", "contextDevApiKey", IMPORT.contextDev.purpose),
	app("appSetting", "googleClientSecret", OAUTH_APPS.purpose),
	app("appSetting", "microsoftClientSecret", OAUTH_APPS.purpose),
	app("appSetting", "slackClientSecret", OAUTH_APPS.purpose),
	app("imapAccount", "secret", IMAP_CREDENTIALS.purpose),
	app("webhook", "secret", WEBHOOKS.purpose),
	app("slackWorkspaceGrant", "userToken", SLACK_USER_TOKEN.purpose),
	app(
		"slackInstallation",
		"userToken",
		SLACK_USER_TOKEN.purpose,
		"installerId",
	),
	betterAuth("account", "accessToken"),
	betterAuth("account", "refreshToken"),
	betterAuth("account", "idToken"),
];

export const RESEAL_STATUSES = ["ok", "empty", "plain", "failed"] as const;

export type ResealStatus = (typeof RESEAL_STATUSES)[number];

export type ResealLine = {
	table: string;
	column: string;
	id: string;
	status: ResealStatus;
	reason: string | null;
};

const row = z.object({ id: z.string(), value: z.string().nullable() });

const rows = z.array(row);

async function resealValue(
	field: SealedField,
	value: string,
	oldSecret: string,
	newSecret: string,
): Promise<{ status: ResealStatus; sealed: string | null }> {
	if (field.scheme === "better-auth") {
		if (!isSealedToken(value)) return { status: "plain", sealed: null };
		await openToken(value, oldSecret);
		return {
			status: "ok",
			sealed: await resealToken(value, oldSecret, newSecret),
		};
	}

	if (!isSealedSecret(value)) return { status: "plain", sealed: null };
	const purpose = field.purpose ?? "";
	const plain = openSecret(value, secretKey(oldSecret, purpose));
	return {
		status: "ok",
		sealed: sealSecret(plain, secretKey(newSecret, purpose)),
	};
}

export async function resealField(
	client: pg.Client,
	field: SealedField,
	oldSecret: string,
	newSecret: string,
): Promise<ResealLine[]> {
	const quoted = `"${field.table}"`;
	const found = rows.parse(
		(
			await client.query(
				`SELECT "${field.key}"::text AS id, "${field.column}" AS value FROM ${quoted} ORDER BY 1`,
			)
		).rows,
	);
	const lines: ResealLine[] = [];

	for (const { id, value } of found) {
		const line = { table: field.table, column: field.column, id };
		const trimmed = value?.trim() ?? "";
		if (!trimmed) {
			lines.push({ ...line, status: "empty", reason: null });
			continue;
		}
		try {
			const { status, sealed } = await resealValue(
				field,
				trimmed,
				oldSecret,
				newSecret,
			);
			if (sealed !== null) {
				await client.query(
					`UPDATE ${quoted} SET "${field.column}" = $1 WHERE "${field.key}"::text = $2`,
					[sealed, id],
				);
			}
			lines.push({ ...line, status, reason: null });
		} catch (error) {
			lines.push({
				...line,
				status: "failed",
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return lines;
}

export async function resealDatabase(
	url: string,
	oldSecret: string,
	newSecret: string,
	fields: readonly SealedField[] = SEALED_FIELDS,
): Promise<ResealLine[]> {
	const client = new pg.Client({ connectionString: url });
	await client.connect();
	try {
		const lines: ResealLine[] = [];
		for (const field of fields) {
			lines.push(...(await resealField(client, field, oldSecret, newSecret)));
		}
		return lines;
	} finally {
		await client.end();
	}
}

export function resealSummary(lines: readonly ResealLine[]): string[] {
	const out: string[] = [];
	const byField = new Map<string, ResealLine[]>();
	for (const line of lines) {
		const name = `${line.table}.${line.column}`;
		byField.set(name, [...(byField.get(name) ?? []), line]);
	}
	for (const [name, group] of byField) {
		const count = (status: ResealStatus) =>
			group.filter((line) => line.status === status).length;
		out.push(
			`${name}: ${count("ok")} ok, ${count("plain")} plain, ${count("empty")} empty, ${count("failed")} failed`,
		);
		for (const line of group) {
			if (line.status === "empty") continue;
			out.push(
				`  ${line.status.padEnd(6)} ${line.id}${line.reason ? `  ${line.reason}` : ""}`,
			);
		}
	}
	return out;
}
