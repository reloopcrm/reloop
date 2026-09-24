import { plainToInstance, Type } from "class-transformer";
import {
	IsEnum,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	IsUrl,
	Matches,
	Max,
	Min,
	MinLength,
	ValidateIf,
	validateSync,
} from "class-validator";

export enum NodeEnv {
	Development = "development",
	Production = "production",
	Test = "test",
}

export class EnvironmentVariables {
	@IsEnum(NodeEnv)
	NODE_ENV: NodeEnv = NodeEnv.Development;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(65535)
	PORT = 3001;

	@IsString()
	@MinLength(1, {
		message:
			"DATABASE_URL is required. `docker compose up -d` starts one, or set it to any Postgres connection string.",
	})
	DATABASE_URL!: string;

	@IsString()
	@MinLength(32, {
		message:
			"BETTER_AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
	})
	BETTER_AUTH_SECRET!: string;

	@ValidateIf((env: EnvironmentVariables) => !env.RELOOP_REGISTRY_URL)
	@IsString()
	@MinLength(1, {
		message:
			'ALLOWED_SIGN_IN is required — it is the only thing deciding who can sign in. Set it to your email domain, e.g. ALLOWED_SIGN_IN="acme.com", or to a single address for a one-person install.',
	})
	ALLOWED_SIGN_IN?: string;

	@IsOptional()
	@IsString()
	@MinLength(1)
	RELOOP_REGISTRY_URL?: string;

	@ValidateIf((env: EnvironmentVariables) => Boolean(env.RELOOP_REGISTRY_URL))
	@IsString()
	@Matches(/\{db\}/, {
		message:
			"RELOOP_TENANT_DATABASE_URL_TEMPLATE is required in hosted mode and must contain {db}, where the tenant's database name goes.",
	})
	RELOOP_TENANT_DATABASE_URL_TEMPLATE?: string;

	@IsOptional()
	@IsString()
	@MinLength(1)
	RELOOP_BACKUP_DIR?: string;

	@IsOptional()
	@IsString()
	@Matches(/^[a-z0-9][a-z0-9-]{1,62}$/, {
		message:
			"RELOOP_OPERATOR_TENANT is a tenant id: lower case letters, digits and dashes.",
	})
	RELOOP_OPERATOR_TENANT?: string;

	@IsOptional()
	@IsString()
	RESEND_API_KEY?: string;

	@IsOptional()
	@IsString()
	MAIL_FROM?: string;

	@IsOptional()
	@IsIn(["0", "1"], {
		message:
			'PASSWORD_SIGN_IN takes "1" to allow sign-in with an email address and a password, and "0" or nothing to refuse it.',
	})
	PASSWORD_SIGN_IN?: string;

	@IsOptional()
	@IsString()
	GOOGLE_CLIENT_ID?: string;

	@IsOptional()
	@IsString()
	GOOGLE_CLIENT_SECRET?: string;

	@IsOptional()
	@IsString()
	MICROSOFT_CLIENT_ID?: string;

	@IsOptional()
	@IsString()
	MICROSOFT_CLIENT_SECRET?: string;

	@IsOptional()
	@IsString()
	MICROSOFT_TENANT_ID?: string;

	@IsOptional()
	@IsString()
	SLACK_CLIENT_ID?: string;

	@IsOptional()
	@IsString()
	SLACK_CLIENT_SECRET?: string;

	@IsOptional()
	@IsUrl({ require_tld: false })
	API_URL?: string;

	@IsOptional()
	@IsString()
	APP_URL?: string;

	@IsOptional()
	@IsString()
	AUTH_COOKIE_DOMAIN?: string;

	@IsOptional()
	@IsString()
	REDIS_URL?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	CACHE_TTL_MS?: number;

	@IsOptional()
	@IsString()
	@MinLength(16, {
		message: "CRON_SECRET must be at least 16 characters.",
	})
	CRON_SECRET?: string;

	@IsOptional()
	@IsString()
	BLOB_READ_WRITE_TOKEN?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	MAILBOX_SYNC_INTERVAL_MS?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	MAILBOX_SYNC_MAX_PER_TICK?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	MAILBOX_SYNC_BACKFILL_CHUNK?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	MAILBOX_SYNC_PAGE_SIZE?: number;

	@IsOptional()
	@IsUrl(
		{ require_tld: false, require_protocol: true },
		{
			message:
				"AGENT_URL must be a full URL with a scheme, like http://127.0.0.1:2000.",
		},
	)
	AGENT_URL?: string;

	@IsOptional()
	@IsString()
	AGENT_BRIDGE_SECRET?: string;

	@IsOptional()
	@IsString()
	OPENROUTER_API_KEY?: string;

	@IsOptional()
	@IsString()
	CRM_TELEMETRY_DISABLED?: string;

	@IsOptional()
	@IsIn(["true", "false"], {
		message:
			'RELOOP_UPDATE_CHECK takes "false" to stop the API asking GitHub for a newer release, and "true" or nothing to keep the check on.',
	})
	RELOOP_UPDATE_CHECK?: string;

	@IsOptional()
	@IsString()
	RELOOP_GERMAN?: string;

	@IsOptional()
	@IsUrl(
		{ require_tld: false, require_protocol: true },
		{
			message:
				"UPDATER_URL must be a full URL with a scheme, like http://updater:8080.",
		},
	)
	UPDATER_URL?: string;

	@IsOptional()
	@IsString()
	UPDATER_TOKEN?: string;

	@IsOptional()
	@IsString()
	RELOOP_MANAGED?: string;

	@IsOptional()
	@IsString()
	STRIPE_SECRET_KEY?: string;

	@IsOptional()
	@IsString()
	STRIPE_WEBHOOK_SECRET?: string;

	@IsOptional()
	@IsString()
	VERCEL?: string;
}

export type RawEnvironment = Record<string, string | undefined>;

function withoutEmptyValues(config: RawEnvironment): RawEnvironment {
	return Object.fromEntries(
		Object.entries(config).filter(([, value]) => value?.trim() !== ""),
	);
}

export function validateEnv(config: RawEnvironment): EnvironmentVariables {
	const validated = plainToInstance(
		EnvironmentVariables,
		withoutEmptyValues(config),
		{
			enableImplicitConversion: true,
			exposeDefaultValues: true,
		},
	);

	const errors = validateSync(validated, {
		skipMissingProperties: false,
		whitelist: false,
	});

	if (errors.length > 0) {
		const details = errors
			.map((error) => Object.values(error.constraints ?? {}).join(", "))
			.join("\n  - ");

		throw new Error(
			`Invalid environment configuration:\n  - ${details}\n\nSee .env.example at the root of the repo.`,
		);
	}

	return validated;
}
