import type { WorkspaceScope } from "@crm/db/cloud/contract";
import { canonicalPlanId } from "@crm/db/plans";
import type { PlanPurchase } from "@crm/db/pricing";
import { scopeOf, unpaidPurchase } from "@crm/db/tenancy";
import type { Subscription } from "@/lib/signed-in-entry";
import {
	inTenant,
	requestTenant,
	hostedCustomer as tenantCustomer,
} from "@/lib/tenant";

export async function requestScope(): Promise<WorkspaceScope | null> {
	const tenant = await requestTenant();
	return tenant ? scopeOf(tenant) : null;
}

export function inScope<T>(fn: () => Promise<T>): Promise<T | null> {
	return inTenant(fn);
}

export function hostedCustomer(): Promise<boolean> {
	return tenantCustomer();
}

export async function pendingPurchase(): Promise<PlanPurchase | null> {
	const tenant = await requestTenant();
	return tenant ? unpaidPurchase(tenant) : null;
}

export async function subscription(): Promise<Subscription | null> {
	const tenant = await requestTenant();
	if (!tenant) return null;
	const { status, interval } = tenant.billing;
	if (status !== "active" && status !== "past_due") return null;
	return { plan: canonicalPlanId(tenant.plan), interval };
}
