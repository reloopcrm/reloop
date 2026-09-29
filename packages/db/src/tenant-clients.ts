import type { Db } from "./client";
import type { CreateClient } from "./cloud/contract";
import { type Tenant, tenantDatabaseUrl } from "./tenancy";
import { TENANCY } from "./tenancy-config";
import { tenantHeld } from "./tenant-context";

const clients = new Map<string, Db>();

export function clientFor(tenant: Tenant, create: CreateClient): Db {
	const existing = clients.get(tenant.id);
	if (existing) {
		clients.delete(tenant.id);
		clients.set(tenant.id, existing);
		return existing;
	}

	const client = create(tenantDatabaseUrl(tenant.dbName), TENANCY.pool.api);
	clients.set(tenant.id, client);

	if (clients.size > TENANCY.clients.max) evictIdle();

	return client;
}

function evictIdle(): void {
	for (const [id, idle] of clients) {
		if (tenantHeld(id)) continue;
		clients.delete(id);
		void idle.$disconnect();
		return;
	}
}

export function openClients(): string[] {
	return [...clients.keys()];
}

export async function disconnectTenant(tenantId: string): Promise<void> {
	const open = clients.get(tenantId);
	clients.delete(tenantId);
	await open?.$disconnect();
}

export async function disconnectClients(): Promise<void> {
	const open = [...clients.values()];
	clients.clear();
	await Promise.all(open.map((client) => client.$disconnect()));
}
