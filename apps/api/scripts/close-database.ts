import { cloud } from "@crm/db/cloud/scope";

export async function closeDatabase(): Promise<void> {
	const { disconnectAll } = await import("@crm/db/client");
	await disconnectAll();
	if (cloud.hosted()) await cloud.close();
}
