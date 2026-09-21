import { readTenantCookie, TENANT_COOKIE_NAME } from "@crm/auth";
import { type Tenant, tenantById } from "@crm/db/tenancy";
import { isHosted, runAsTenant } from "@crm/db/tenant-context";
import { cookies } from "next/headers";
import { cache } from "react";

export const requestTenant = cache(async (): Promise<Tenant | null> => {
	if (!isHosted()) return null;

	const tenantId = readTenantCookie(
		(await cookies()).get(TENANT_COOKIE_NAME)?.value,
		process.env.BETTER_AUTH_SECRET ?? "",
	);
	if (!tenantId) return null;

	const tenant = await tenantById(tenantId);
	return tenant?.status === "active" ? tenant : null;
});

export async function inTenant<T>(fn: () => Promise<T>): Promise<T | null> {
	if (!isHosted()) return fn();

	const tenant = await requestTenant();
	return tenant ? runAsTenant(tenant, fn) : null;
}
