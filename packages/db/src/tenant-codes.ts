import { z } from "zod";
import { registryPool } from "./tenancy";

export const TENANT_CODE_PURPOSES = ["signup", "reset", "delete"] as const;

export type TenantCodePurpose = (typeof TENANT_CODE_PURPOSES)[number];

const tenantCodeRow = z
	.object({
		email: z.string(),
		purpose: z.enum(TENANT_CODE_PURPOSES),
		tenant_id: z.string(),
		code_hash: z.string(),
		expires_at: z.date(),
		sent_at: z.date(),
		attempts: z.number().int(),
		locale: z.string(),
		name: z.string().nullable(),
		password_hash: z.string().nullable(),
	})
	.transform((row) => ({
		email: row.email,
		purpose: row.purpose,
		tenantId: row.tenant_id,
		codeHash: row.code_hash,
		expiresAt: row.expires_at,
		sentAt: row.sent_at,
		attempts: row.attempts,
		locale: row.locale,
		name: row.name,
		passwordHash: row.password_hash,
	}));

export type TenantCode = z.infer<typeof tenantCodeRow>;

export type NewTenantCode = {
	email: string;
	purpose: TenantCodePurpose;
	tenantId: string;
	codeHash: string;
	expiresAt: Date;
	locale: string;
	name?: string;
	passwordHash?: string;
};

export async function saveTenantCode(input: NewTenantCode): Promise<void> {
	await registryPool().query(
		`INSERT INTO tenant_code (email, purpose, tenant_id, code_hash, expires_at, locale, name, password_hash)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (email, purpose) DO UPDATE SET
		   tenant_id = EXCLUDED.tenant_id,
		   code_hash = EXCLUDED.code_hash,
		   expires_at = EXCLUDED.expires_at,
		   sent_at = now(),
		   attempts = 0,
		   locale = EXCLUDED.locale,
		   name = COALESCE(EXCLUDED.name, tenant_code.name),
		   password_hash = COALESCE(EXCLUDED.password_hash, tenant_code.password_hash)`,
		[
			input.email,
			input.purpose,
			input.tenantId,
			input.codeHash,
			input.expiresAt,
			input.locale,
			input.name ?? null,
			input.passwordHash ?? null,
		],
	);
	await registryPool().query("DELETE FROM tenant_code WHERE expires_at < $1", [
		new Date(Date.now() - 24 * 60 * 60_000),
	]);
}

export async function tenantCode(
	email: string,
	purpose: TenantCodePurpose,
): Promise<TenantCode | null> {
	const result = await registryPool().query(
		"SELECT * FROM tenant_code WHERE email = $1 AND purpose = $2",
		[email, purpose],
	);
	const row = result.rows[0];
	return row ? tenantCodeRow.parse(row) : null;
}

export async function countTenantCodeAttempt(
	email: string,
	purpose: TenantCodePurpose,
): Promise<number> {
	const result = await registryPool().query<{ attempts: number }>(
		"UPDATE tenant_code SET attempts = attempts + 1 WHERE email = $1 AND purpose = $2 RETURNING attempts",
		[email, purpose],
	);
	return result.rows[0]?.attempts ?? Number.MAX_SAFE_INTEGER;
}

export async function deleteTenantCode(
	email: string,
	purpose: TenantCodePurpose,
): Promise<void> {
	await registryPool().query(
		"DELETE FROM tenant_code WHERE email = $1 AND purpose = $2",
		[email, purpose],
	);
}
