import { z } from "zod";
import { TENANCY } from "./tenancy-config";

export const TENANT_STATUSES = [
	"active",
	"suspended",
	"migration_failed",
	"deleted",
] as const;

export const tenantId = z
	.string()
	.regex(
		/^[a-z0-9][a-z0-9-]{1,62}$/,
		"A tenant id is lower case, no underscore.",
	);

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
	deletedAt: z.date().nullable(),
	allowList: z.array(z.string().min(1)),
});

export type Tenant = z.infer<typeof tenant>;

export function tenantDatabaseUrl(dbName: string): string {
	const template = process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
	if (!template?.includes(TENANCY.template.placeholder)) {
		throw new Error(
			`RELOOP_TENANT_DATABASE_URL_TEMPLATE must contain ${TENANCY.template.placeholder}, the place the tenant's database name goes.`,
		);
	}
	return template.replace(TENANCY.template.placeholder, dbName);
}
