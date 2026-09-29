import {
	activeTenants,
	closeRegistry,
	forEachTenant,
	grantTenantSignIn,
	pingRegistry,
	revokeTenantSignIn,
	scopeOf,
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
	current: () => scopeOf(currentTenant()),
	addOns: () => currentTenant().billing.addOns,
	scopedKey: tenantScopedKey,
	hold: holdTenant,
	run: (scope, fn) => runAsTenant(tenantOf(scope), fn),
	byId: async (id) => {
		const found = await tenantById(id);
		return found ? scopeOf(found) : null;
	},
	activeBySite: async (siteId) => {
		const found = await tenantBySite(siteId);
		return found?.status === "active" ? scopeOf(found) : null;
	},
	active: async () => (await activeTenants()).map(scopeOf),
	forEachScope: forEachTenant,
	resolveClient: (single, create) =>
		isHosted() ? clientFor(currentTenant(), create) : single(),
	disconnectClients,
	ping: pingRegistry,
	close: closeRegistry,
	onMemberAdded: (email) => signIn(grantTenantSignIn, email),
	onMemberRemoved: (email) => signIn(revokeTenantSignIn, email),
};
