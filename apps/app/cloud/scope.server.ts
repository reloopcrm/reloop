import type { WorkspaceScope } from "@crm/db/cloud/contract";
import type { PlanPurchase } from "@crm/db/pricing";

export async function requestScope(): Promise<WorkspaceScope | null> {
	return null;
}

export function inScope<T>(fn: () => Promise<T>): Promise<T | null> {
	return fn();
}

export async function hostedCustomer(): Promise<boolean> {
	return false;
}

export async function pendingPurchase(): Promise<PlanPurchase | null> {
	return null;
}
