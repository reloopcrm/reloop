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

const holds = new Map<string, number>();

export function isHosted(): boolean {
	return Boolean(process.env.RELOOP_REGISTRY_URL);
}

function hold(id: string): () => void {
	holds.set(id, (holds.get(id) ?? 0) + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const left = (holds.get(id) ?? 1) - 1;
		if (left > 0) holds.set(id, left);
		else holds.delete(id);
	};
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { then?: unknown }).then === "function"
	);
}

export function runAsTenant<T>(tenant: Tenant, fn: () => T): T {
	const release = hold(tenant.id);
	let result: T;
	try {
		result = storage.run(tenant, fn);
	} catch (error) {
		release();
		throw error;
	}
	if (isThenable(result)) {
		result.then(release, release);
	} else {
		release();
	}
	return result;
}

export function holdTenant<T>(fn: () => T): T {
	const tenant = storage.getStore();
	return tenant ? runAsTenant(tenant, fn) : fn();
}

export function tenantHeld(id: string): boolean {
	return holds.has(id);
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
