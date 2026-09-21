import { AsyncLocalStorage } from "node:async_hooks";
import type { Tenant } from "./tenancy";

export class TenantContextMissing extends Error {
	constructor() {
		super(
			"No tenant in context. Hosted mode resolves every database call through runAsTenant().",
		);
		this.name = "TenantContextMissing";
	}
}

const storage = new AsyncLocalStorage<Tenant>();

export function isHosted(): boolean {
	return Boolean(process.env.RELOOP_REGISTRY_URL);
}

export function runAsTenant<T>(tenant: Tenant, fn: () => T): T {
	return storage.run(tenant, fn);
}

export function currentTenant(): Tenant {
	const tenant = storage.getStore();
	if (!tenant) throw new TenantContextMissing();
	return tenant;
}

export function currentTenantId(): string | null {
	return isHosted() ? currentTenant().id : null;
}

export function tenantScopedKey(key: string): string {
	const tenantId = currentTenantId();
	return tenantId ? `${tenantId}:${key}` : key;
}
