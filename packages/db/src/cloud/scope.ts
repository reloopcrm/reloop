import {
	activeTenants,
	closeRegistry,
	forEachTenant,
	grantTenantSignIn,
	pingRegistry,
	revokeTenantSignIn,
	type Tenant,
	tenant,
	tenantById,
	tenantBySite,
} from "../tenancy";
import { TENANCY } from "../tenancy-config";
import { clientFor, disconnectClients } from "../tenant-clients";
import {
	currentTenant,
	currentTenantId,
	holdTenant,
	isHosted,
	isHostedCustomer,
	operatorTenantId,
	runAsTenant,
	tenantScopedKey,
} from "../tenant-context";
import type { CloudScope, WorkspaceScope } from "./contract";

function tenantOf(scope: WorkspaceScope): Tenant {
	return tenant.parse(scope);
}

async function signIn(
	update: (tenantId: string, address: string) => Promise<void>,
	email: string,
): Promise<void> {
	const tenantId = currentTenantId();
	if (tenantId) await update(tenantId, email);
}

export const cloud: CloudScope = {
	loop: { budgetMs: TENANCY.loop.budgetMs },
	backup: { retentionDays: TENANCY.backup.retentionDays },
	hosted: isHosted,
	customer: isHostedCustomer,
	operatorId: operatorTenantId,
	scopeId: currentTenantId,
	current: currentTenant,
	addOns: () => currentTenant().billing.addOns,
	scopedKey: tenantScopedKey,
	hold: holdTenant,
	run: (scope, fn) => runAsTenant(tenantOf(scope), fn),
	byId: tenantById,
	activeBySite: async (siteId) => {
		const found = await tenantBySite(siteId);
		return found?.status === "active" ? found : null;
	},
	active: activeTenants,
	forEachScope: forEachTenant,
	resolveClient: (single, create) =>
		isHosted() ? clientFor(currentTenant(), create) : single(),
	disconnectClients,
	ping: pingRegistry,
	close: closeRegistry,
	onMemberAdded: (email) => signIn(grantTenantSignIn, email),
	onMemberRemoved: (email) => signIn(revokeTenantSignIn, email),
};
