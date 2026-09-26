import { readTenantCookie, TENANT_COOKIE_NAME } from "@crm/auth";
import { type Tenant, tenantById } from "@crm/db/tenancy";
import {
	isHosted,
	isOperatorTenantId,
	runAsTenant,
} from "@crm/db/tenant-context";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

export const requestTenant = cache(async (): Promise<Tenant | null> => {
	if (!isHosted()) return null;

	await connection();

	const tenantId = readTenantCookie(
		(await cookies()).get(TENANT_COOKIE_NAME)?.value,
		process.env.BETTER_AUTH_SECRET ?? "",
	);
	if (!tenantId) return null;

	const tenant = await tenantById(tenantId);
	return tenant?.status === "active" || tenant?.status === "suspended"
		? tenant
		: null;
});

export async function inTenant<T>(fn: () => Promise<T>): Promise<T | null> {
	if (!isHosted()) return fn();

	const tenant = await requestTenant();
	return tenant ? runAsTenant(tenant, fn) : null;
}

export const operatorTenant = cache(async (): Promise<boolean> => {
	if (!isHosted()) return false;
	return isOperatorTenantId((await requestTenant())?.id);
});

export const hostedCustomer = cache(async (): Promise<boolean> => {
	return isHosted() && !(await operatorTenant());
});
