import { AsyncLocalStorage } from "node:async_hooks";
import type { WorkspaceScope } from "@crm/db/cloud/contract";
import { cloud } from "@crm/db/cloud/scope";

const store = new AsyncLocalStorage<WorkspaceScope>();

const selfHosted = { ...cloud };

function tenantContextMissing(): never {
	const error = new Error("No tenant in context");
	error.name = "TenantContextMissing";
	throw error;
}

export function workspace(id: string): WorkspaceScope {
	return {
		id,
		slug: id,
		plan: "pro",
		allowList: [],
		createdAt: new Date(),
		trialEndsAt: null,
	} as unknown as WorkspaceScope;
}

export function actHosted(): void {
	Object.assign(cloud, {
		hosted: () => true,
		scopeId: () => store.getStore()?.id ?? tenantContextMissing(),
		current: () => store.getStore() ?? tenantContextMissing(),
		run: <T>(tenant: WorkspaceScope, fn: () => T): T => store.run(tenant, fn),
	});
}

export function actSelfHosted(): void {
	Object.assign(cloud, selfHosted);
}
