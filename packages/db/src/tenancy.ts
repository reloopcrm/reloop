import pg from "pg";
import { z } from "zod";
import { ADD_ON_IDS, canonicalPlanId, NO_ADD_ONS } from "./plans";
import { type PlanPurchase, planPurchase } from "./pricing";
import { TENANCY } from "./tenancy-config";
import { isHosted, runAsTenant } from "./tenant-context";

export const TENANT_STATUSES = [
	"pending",
	"active",
	"suspended",
	"migration_failed",
	"deleted",
] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const tenantId = z
	.string()
	.regex(
		/^[a-z0-9][a-z0-9-]{1,62}$/,
		"A tenant id is lower case, no underscore.",
	);

export const BILLING_STATUSES = [
	"none",
	"active",
	"past_due",
	"canceled",
] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];

const addOnQuantities = z.object(
	Object.fromEntries(
		ADD_ON_IDS.map((id) => [id, z.number().int().min(0).default(0)]),
	) as Record<(typeof ADD_ON_IDS)[number], z.ZodDefault<z.ZodNumber>>,
);

export const tenantBilling = z.object({
	customerId: z.string().min(1).nullable().default(null),
	subscriptionId: z.string().min(1).nullable().default(null),
	status: z.enum(BILLING_STATUSES).default("none"),
	interval: z.enum(["month", "year"]).nullable().default(null),
	cancelAt: z.coerce.date().nullable().default(null),
	addOns: addOnQuantities.default(NO_ADD_ONS),
	wanted: planPurchase.nullable().default(null),
});

export type TenantBilling = z.infer<typeof tenantBilling>;

export const NO_BILLING: TenantBilling = tenantBilling.parse({});

export const tenant = z.object({
	id: tenantId,
	slug: z.string().min(1).max(63),
	dbName: z.string().regex(/^[a-zA-Z0-9_]+$/),
	plan: z.string().min(1),
	status: z.enum(TENANT_STATUSES),
	aiMode: z.string().min(1),
	signIn: z.string().min(1),
	createdAt: z.date(),
	trialEndsAt: z.date().nullable(),
	suspendedAt: z.date().nullable(),
	deletedAt: z.date().nullable(),
	allowList: z.array(z.string().min(1)),
	paidUntil: z.date().nullable(),
	graceUntil: z.date().nullable(),
	billing: tenantBilling,
});

export type Tenant = z.infer<typeof tenant>;

export function unpaidPurchase(tenant: Tenant): PlanPurchase | null {
	const { status, wanted } = tenant.billing;
	if (status !== "none" || canonicalPlanId(tenant.plan) !== "trial")
		return null;
	return wanted;
}

const tenantRow = z
	.object({
		id: z.string(),
		slug: z.string(),
		db_name: z.string(),
		plan: z.string(),
		status: z.string(),
		ai_mode: z.string(),
		sign_in: z.string(),
		created_at: z.date(),
		trial_ends_at: z.date().nullable(),
		suspended_at: z.date().nullish(),
		deleted_at: z.date().nullable(),
		allow_list: z.array(z.string()).nullable(),
		paid_until: z.date().nullish(),
		grace_until: z.date().nullish(),
		billing: z.unknown().nullish(),
	})
	.transform((row) =>
		tenant.parse({
			id: row.id,
			slug: row.slug,
			dbName: row.db_name,
			plan: row.plan,
			status: row.status,
			aiMode: row.ai_mode,
			signIn: row.sign_in,
			createdAt: row.created_at,
			trialEndsAt: row.trial_ends_at,
			suspendedAt: row.suspended_at ?? null,
			deletedAt: row.deleted_at,
			allowList: row.allow_list ?? [],
			paidUntil: row.paid_until ?? null,
			graceUntil: row.grace_until ?? null,
			billing: tenantBilling.parse(row.billing ?? {}),
		}),
	);

const tenantRows = z.array(tenantRow);

export const newTenant = tenant
	.pick({ id: true, slug: true, dbName: true, allowList: true })
	.extend({
		plan: z.string().min(1).default("trial"),
		status: z.enum(TENANT_STATUSES).default("active"),
		aiMode: z.string().min(1).default("operator"),
		signIn: z.string().min(1).default("google"),
		trialEndsAt: z.date().nullable().default(null),
		siteIds: z.array(z.string().min(1)).default([]),
		name: z.string().trim().min(1).max(120).optional(),
	});

export type NewTenant = z.input<typeof newTenant>;

export function tenantDatabaseUrl(dbName: string): string {
	const template = process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
	if (!template?.includes(TENANCY.template.placeholder)) {
		throw new Error(
			`RELOOP_TENANT_DATABASE_URL_TEMPLATE must contain ${TENANCY.template.placeholder}, the place the tenant's database name goes.`,
		);
	}
	return template.replace(TENANCY.template.placeholder, dbName);
}

const REGISTRY_SCHEMA = `
CREATE TABLE IF NOT EXISTS tenant (
	id text PRIMARY KEY,
	slug text NOT NULL UNIQUE,
	db_name text NOT NULL UNIQUE,
	plan text NOT NULL DEFAULT 'trial',
	status text NOT NULL DEFAULT 'active',
	ai_mode text NOT NULL DEFAULT 'operator',
	sign_in text NOT NULL DEFAULT 'google',
	created_at timestamptz NOT NULL DEFAULT now(),
	trial_ends_at timestamptz,
	deleted_at timestamptz
);
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS paid_until timestamptz;
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS grace_until timestamptz;
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS billing jsonb;
CREATE TABLE IF NOT EXISTS tenant_sign_in (
	entry text PRIMARY KEY,
	tenant_id text NOT NULL REFERENCES tenant(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tenant_sign_in_tenant_id ON tenant_sign_in(tenant_id);
CREATE TABLE IF NOT EXISTS tenant_site (
	site_id text PRIMARY KEY,
	tenant_id text NOT NULL REFERENCES tenant(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tenant_site_tenant_id ON tenant_site(tenant_id);
CREATE TABLE IF NOT EXISTS tenant_code (
	email text NOT NULL,
	purpose text NOT NULL,
	tenant_id text NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
	code_hash text NOT NULL,
	expires_at timestamptz NOT NULL,
	sent_at timestamptz NOT NULL DEFAULT now(),
	attempts integer NOT NULL DEFAULT 0,
	locale text NOT NULL DEFAULT 'en',
	name text,
	password_hash text,
	PRIMARY KEY (email, purpose)
);
CREATE TABLE IF NOT EXISTS billing_mail (
	key text PRIMARY KEY,
	tenant_id text NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
	sent_at timestamptz NOT NULL DEFAULT now()
);
`;

const SELECT_TENANT = `
SELECT t.*, (
	SELECT array_agg(s.entry ORDER BY s.entry) FROM tenant_sign_in s WHERE s.tenant_id = t.id
) AS allow_list
FROM tenant t
WHERE t.deleted_at IS NULL`;

let registry: { url: string; pool: pg.Pool } | undefined;

export function registryPool(): pg.Pool {
	const url = process.env.RELOOP_REGISTRY_URL;
	if (!url) {
		throw new Error(
			"RELOOP_REGISTRY_URL is not set. The registry only exists in hosted mode.",
		);
	}
	if (registry?.url !== url) {
		void registry?.pool.end();
		registry = {
			url,
			pool: new pg.Pool({
				connectionString: url,
				max: TENANCY.registry.pool.max,
			}),
		};
	}
	return registry.pool;
}

const cached = new Map<string, { tenant: Tenant; until: number }>();

function remember(found: Tenant): Tenant {
	cached.set(found.id, {
		tenant: found,
		until: Date.now() + TENANCY.registry.cacheMs,
	});
	return found;
}

export function forgetTenants(): void {
	cached.clear();
}

export function forgetTenant(id: string): void {
	cached.delete(id);
}

async function selectTenants(
	where: string,
	values: readonly (string | string[])[],
): Promise<Tenant[]> {
	const result = await registryPool().query(`${SELECT_TENANT} AND ${where}`, [
		...values,
	]);
	return tenantRows.parse(result.rows);
}

export async function ensureRegistrySchema(): Promise<void> {
	await registryPool().query(REGISTRY_SCHEMA);
}

export async function pingRegistry(): Promise<void> {
	await registryPool().query("SELECT 1");
}

export async function closeRegistry(): Promise<void> {
	const open = registry;
	registry = undefined;
	cached.clear();
	await open?.pool.end();
}

export async function tenantById(id: string): Promise<Tenant | null> {
	if (!tenantId.safeParse(id).success) return null;

	const hit = cached.get(id);
	if (hit && hit.until > Date.now()) return hit.tenant;

	const [found] = await selectTenants("t.id = $1", [id]);
	return found ? remember(found) : null;
}

export function signInEntriesFor(email: string): string[] {
	const address = email.trim().toLowerCase();
	const host = address.split("@")[1];
	if (!host || address.split("@").length !== 2) return [];

	const labels = host.split(".");
	const domains = labels.map((_, index) => labels.slice(index).join("."));
	return [address, ...domains.filter((domain) => domain.includes("."))];
}

export async function tenantBySignIn(email: string): Promise<Tenant | null> {
	const entries = signInEntriesFor(email);
	if (entries.length === 0) return null;

	const [found] = await selectTenants(
		"t.id = (SELECT tenant_id FROM tenant_sign_in WHERE entry = ANY($1) ORDER BY length(entry) DESC LIMIT 1)",
		[entries],
	);
	return found ? remember(found) : null;
}

export async function tenantBySite(siteId: string): Promise<Tenant | null> {
	const [found] = await selectTenants(
		"t.id = (SELECT tenant_id FROM tenant_site WHERE site_id = $1)",
		[siteId],
	);
	return found ? remember(found) : null;
}

export async function activeTenants(): Promise<Tenant[]> {
	return selectTenants("t.status = 'active' ORDER BY t.created_at, t.id", []);
}

export async function allTenants(): Promise<Tenant[]> {
	return selectTenants("true ORDER BY t.created_at, t.id", []);
}

export async function pendingTenantsBefore(before: Date): Promise<Tenant[]> {
	return selectTenants("t.status = 'pending' AND t.created_at < $1", [
		before.toISOString(),
	]);
}

export async function expiredTrials(now: Date): Promise<Tenant[]> {
	return selectTenants(
		"t.status = 'active' AND t.plan = 'trial' AND t.trial_ends_at IS NOT NULL AND t.trial_ends_at < $1",
		[now.toISOString()],
	);
}

export async function trialsEndingBetween(
	from: Date,
	until: Date,
): Promise<Tenant[]> {
	return selectTenants(
		"t.status = 'active' AND t.plan = 'trial' AND t.trial_ends_at > $1 AND t.trial_ends_at <= $2",
		[from.toISOString(), until.toISOString()],
	);
}

export async function claimBillingMail(
	key: string,
	tenantId: string,
): Promise<boolean> {
	const result = await registryPool().query(
		"INSERT INTO billing_mail (key, tenant_id) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key",
		[key, tenantId],
	);
	return (result.rowCount ?? 0) > 0;
}

export async function releaseBillingMail(key: string): Promise<void> {
	await registryPool().query("DELETE FROM billing_mail WHERE key = $1", [key]);
}

export async function graceExpired(now: Date): Promise<Tenant[]> {
	return selectTenants(
		"t.status = 'active' AND t.grace_until IS NOT NULL AND t.grace_until < $1",
		[now.toISOString()],
	);
}

export async function tenantByCustomer(
	customerId: string,
): Promise<Tenant | null> {
	const [found] = await selectTenants("t.billing->>'customerId' = $1", [
		customerId,
	]);
	return found ? remember(found) : null;
}

export type TenantBillingWrite = {
	plan: string;
	paidUntil: Date | null;
	graceUntil: Date | null;
	billing: TenantBilling;
};

export async function writeTenantBilling(
	id: string,
	write: TenantBillingWrite,
): Promise<void> {
	await registryPool().query(
		`UPDATE tenant SET plan = $2, paid_until = $3, grace_until = $4, billing = $5::jsonb
		 WHERE id = $1`,
		[
			id,
			write.plan,
			write.paidUntil,
			write.graceUntil,
			JSON.stringify(tenantBilling.parse(write.billing)),
		],
	);
	forgetTenant(id);
}

export async function suspendedBefore(before: Date): Promise<Tenant[]> {
	return selectTenants(
		"t.status = 'suspended' AND t.suspended_at IS NOT NULL AND t.suspended_at < $1",
		[before.toISOString()],
	);
}

export async function setTenantStatus(
	id: string,
	status: TenantStatus,
): Promise<void> {
	await registryPool().query(
		`UPDATE tenant SET status = $2,
		   suspended_at = CASE WHEN $2 = 'suspended' THEN now() ELSE NULL END
		 WHERE id = $1`,
		[id, status],
	);
	forgetTenant(id);
}

export async function activateTenant(
	id: string,
	entries: readonly string[],
): Promise<void> {
	const client = await registryPool().connect();
	try {
		await client.query("BEGIN");
		await client.query(
			"UPDATE tenant SET status = 'active' WHERE id = $1 AND status = 'pending'",
			[id],
		);
		for (const entry of entries) {
			await client.query(
				"INSERT INTO tenant_sign_in (entry, tenant_id) VALUES ($1, $2) ON CONFLICT (entry) DO NOTHING",
				[entry.trim().toLowerCase().replace(/^@/, ""), id],
			);
		}
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
	forgetTenant(id);
}

export async function removeTenant(id: string): Promise<void> {
	await registryPool().query("DELETE FROM tenant WHERE id = $1", [id]);
	forgetTenant(id);
}

export async function createTenant(input: NewTenant): Promise<Tenant> {
	const values = newTenant.parse(input);
	const client = await registryPool().connect();

	try {
		await client.query("BEGIN");
		await client.query(
			`INSERT INTO tenant (id, slug, db_name, plan, status, ai_mode, sign_in, trial_ends_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, db_name = EXCLUDED.db_name,
			   plan = EXCLUDED.plan, ai_mode = EXCLUDED.ai_mode, sign_in = EXCLUDED.sign_in,
			   trial_ends_at = EXCLUDED.trial_ends_at, status = EXCLUDED.status,
			   suspended_at = NULL, deleted_at = NULL,
			   paid_until = NULL, grace_until = NULL, billing = NULL`,
			[
				values.id,
				values.slug,
				values.dbName,
				values.plan,
				values.status,
				values.aiMode,
				values.signIn,
				values.trialEndsAt,
			],
		);
		await client.query("DELETE FROM tenant_sign_in WHERE tenant_id = $1", [
			values.id,
		]);
		for (const entry of values.allowList) {
			await client.query(
				"INSERT INTO tenant_sign_in (entry, tenant_id) VALUES ($1, $2)",
				[entry.trim().toLowerCase().replace(/^@/, ""), values.id],
			);
		}
		await client.query("DELETE FROM tenant_site WHERE tenant_id = $1", [
			values.id,
		]);
		for (const siteId of values.siteIds) {
			await client.query(
				"INSERT INTO tenant_site (site_id, tenant_id) VALUES ($1, $2)",
				[siteId, values.id],
			);
		}
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}

	forgetTenant(values.id);
	const created = await tenantById(values.id);
	if (!created) throw new Error(`Tenant ${values.id} was not written.`);
	return created;
}

export type TenantOutcome<T> =
	| { tenantId: string; ok: true; result: T }
	| { tenantId: string; ok: false; error: string };

export type TenantLoop<T> = { tenants: TenantOutcome<T>[] };

export type TenantLoopOptions = {
	concurrency?: number;
	budgetMs?: number;
};

export async function forEachTenant<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	options: TenantLoopOptions = {},
): Promise<T | TenantLoop<T>> {
	if (!isHosted()) return fn(new AbortController().signal);

	const concurrency = options.concurrency ?? TENANCY.loop.concurrency;
	const budgetMs = options.budgetMs ?? TENANCY.loop.budgetMs;
	const tenants = await activeTenants();
	const outcomes: TenantOutcome<T>[] = [];
	let next = 0;

	const worker = async () => {
		while (next < tenants.length) {
			const index = next;
			next += 1;
			const current = tenants[index];
			if (!current) return;
			outcomes[index] = await withinBudget(current, fn, budgetMs);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(concurrency, tenants.length) }, worker),
	);

	return { tenants: outcomes };
}

async function withinBudget<T>(
	current: Tenant,
	fn: (signal: AbortSignal) => Promise<T>,
	budgetMs: number,
): Promise<TenantOutcome<T>> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const controller = new AbortController();
	const expired = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new Error(`Tenant budget of ${budgetMs} ms exceeded`));
		}, budgetMs);
	});

	try {
		const work = runAsTenant(current, () => fn(controller.signal));
		work.catch(() => {});
		const result = await Promise.race([work, expired]);
		return { tenantId: current.id, ok: true, result };
	} catch (error) {
		return {
			tenantId: current.id,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}
